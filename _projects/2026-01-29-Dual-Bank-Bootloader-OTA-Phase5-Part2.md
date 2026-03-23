---
layout: page
title: "Bootloader with OTA Phase 5 - Part 2: OTA Handler Implementation"
date: 2026-01-29 22:10:21
category: Dual-Bank Bootloader with OTA Update
toc:
  beginning: true
  sidebar: left
---

## Phase 5 Overview

- Design complete OTA protocol (START, DATA, END packets)
- Implement OTA state machine
- Application can receive firmware via UART simulation
- Write firmware to inactive bank
- Verify firmware with CRC32
- Update boot state after successful OTA
- Create test simulation

## OTA Download Logic

**The goal:** Your application (running from Bank A) will receive a new firmware binary and write it to Bank B.

**Before we start coding, let's think through the architecture:**

### Key Questions:

**Question 1: How will the application receive firmware?**

- Via UART (simulating OTA)
- What protocol? Raw binary? With headers? With checksums?

**Question 2: How big can firmware be?**

- You allocated 256KB per bank
- Current application is ~30KB
- Should we receive it all at once or in chunks?

**Question 3: Where does the application store incoming data?**

- Option A: Directly write to Bank B flash as data arrives
- Option B: Buffer in RAM, then write to flash
- Which is safer and why?

**Question 4: What information should accompany the firmware?**

- Just raw binary?
- Or: size, version, CRC/hash, metadata?

**Here's my recommended approach for Phase 5:**

### Step 1: Design the Firmware Package Format

```c
typedef struct {
    uint32_t magic_number;      // e.g., 0xFEEDFACE
    uint32_t version;           // Firmware version
    uint32_t size;              // Size in bytes
    uint32_t crc32;             // CRC32 of firmware binary
    // Followed by actual firmware data
} firmware_header_t;
```

### Step 2: Implement in Application

1. Add UART command to receive firmware
2. Receive firmware in chunks (e.g., 1KB at a time)
3. Write each chunk to Bank B
4. Verify CRC after complete transfer
5. Update boot_state to mark Bank B as valid

**Before we dive in, answer these questions:**

1. **How should we send firmware via UART?**
   - Use a simple text protocol like "START", then binary data, then "END"?
   - Or use an existing protocol like XMODEM?
   - Or keep it super simple: just send bytes?
2. **How will the application know firmware transfer is complete?**
   - Fixed size declared upfront?
   - End marker?
   - Timeout?

But we won't use XMODEM because XMODEM is actually outdated (1970s protocol) and has limitations:

- 128-byte or 1KB fixed packet size
- Simple checksum (not CRC32)
- No metadata (version, size, hash)
- Designed for terminal communication, not firmware updates

Instead, using UART teaches:

- Chunked transfer with CRC
- State machines
- Flash programming in real-time
- Error recovery
- Verification

What is more common in real industry:

1. **Header with metadata** (size, version, CRC)
2. **Chunked transfer** with per-chunk verification
3. **Final verification** before switching banks
4. **Atomic updates** (all-or-nothing)

Transfer Protocol:

1. Host sends: Firmware Header (size, version, CRC32)
2. Device acknowledges header
3. Host sends: Data chunks (1KB each) with chunk CRC
4. Device acknowledges each chunk after writing to flash
5. After all chunks: Device verifies full firmware CRC
6. Device updates boot state

## Phase 5 Step-by-Step Plan

### Step 1: Define Protocol (Week 6, Day 1-2)

Create `ota_protocol.h` with packet structures

### Step 2: Implement Flash Writer in Application (Week 6, Day 3-4)

Functions to write firmware chunks to Bank B

### Step 3: Implement UART Receiver (Week 6, Day 5-7)

State machine to receive and process packets

### Step 4: Python Host Script (Week 7, Day 1-2)

Script to send firmware over UART

### Step 5: Integration & Testing (Week 7, Day 3-5)

End-to-end OTA update test

### Step 6: Add Verification & Rollback Safety (Week 7, Day 6-7)

Verify before switch, handle failures

## `ota_protocol.h` with packet structures

## Step 1: Design the Protocol

Before writing any code, we need to design our communication protocol. This is how real embedded engineers work - design first, code second.

**Protocol Requirements:**

1. Reliable data transfer over UART
2. Error detection (CRC for each chunk + entire firmware)
3. Acknowledgment system (host knows if device received correctly)
4. Ability to recover from errors
5. Metadata about firmware (size, version, hash)

**Let me show you the packet structure, then I want YOU to think about the flow:**

First, create `ota_protocol.h`:

```c
#ifndef OTA_PROTOCOL_H
#define OTA_PROTOCOL_H

#include <stdint.h>

// Protocol magic numbers
#define OTA_MAGIC_START     0xAA55AA55
#define OTA_MAGIC_DATA      0x55AA55AA

// Packet types
#define OTA_PKT_START       0x01  // Initial handshake with firmware info
#define OTA_PKT_DATA        0x02  // Data chunk
#define OTA_PKT_END         0x03  // Transfer complete
#define OTA_PKT_ACK         0x04  // Acknowledgment
#define OTA_PKT_NACK        0x05  // Negative acknowledgment (error)
#define OTA_PKT_ABORT       0x06  // Abort transfer

// Error codes
#define OTA_ERR_NONE        0x00
#define OTA_ERR_CRC         0x01
#define OTA_ERR_SIZE        0x02
#define OTA_ERR_FLASH       0x03
#define OTA_ERR_SEQUENCE    0x04
#define OTA_ERR_TIMEOUT     0x05

// Configuration
#define OTA_CHUNK_SIZE      1024  // 1KB chunks
#define OTA_MAX_RETRIES     3
#define OTA_TIMEOUT_MS      5000

// START packet: Sent by host to begin transfer
typedef struct {
    uint32_t magic;              // OTA_MAGIC_START
    uint8_t packet_type;         // OTA_PKT_START
    uint32_t firmware_size;      // Total size in bytes
    uint32_t firmware_version;   // Version number
    uint32_t firmware_crc32;     // CRC32 of entire firmware
    uint32_t total_chunks;       // Number of data chunks to expect
    uint8_t target_bank;         // BANK_A or BANK_B
} __attribute__((packed)) ota_start_packet_t;

// DATA packet: Contains one chunk of firmware
typedef struct {
    uint32_t magic;              // OTA_MAGIC_DATA
    uint8_t packet_type;         // OTA_PKT_DATA
    uint32_t chunk_number;       // Sequential chunk number (0-based)
    uint16_t chunk_size;         // Size of data in this chunk (≤ OTA_CHUNK_SIZE)
    uint32_t chunk_crc32;        // CRC32 of this chunk's data
    uint8_t data[OTA_CHUNK_SIZE]; // Actual firmware data
} __attribute__((packed)) ota_data_packet_t;

// END packet: Signals transfer complete
typedef struct {
    uint32_t magic;              // OTA_MAGIC_START
    uint8_t packet_type;         // OTA_PKT_END
} __attribute__((packed)) ota_end_packet_t;

// ACK/NACK packet: Device response
typedef struct {
    uint32_t magic;              // OTA_MAGIC_START
    uint8_t packet_type;         // OTA_PKT_ACK or OTA_PKT_NACK
    uint8_t error_code;          // OTA_ERR_* if NACK
    uint32_t last_chunk_received; // Last successfully received chunk
} __attribute__((packed)) ota_response_packet_t;

#endif // OTA_PROTOCOL_H
```

A state machine is how we handle the OTA process step-by-step. Here's a skeleton:

```
OTA States:
- IDLE: Waiting for OTA to start
- RECEIVING_HEADER: Received START packet, validating
- RECEIVING_DATA: Receiving data chunks
- VERIFYING: All chunks received, verifying CRC
- FINALIZING: Writing boot state
- COMPLETE: OTA successful
- ERROR: Something went wrong
```

### 1. START Packet Handling ✅ (Mostly Correct)

**You said:** Check firmware size, version, total chunks, target bank, send ACK back

- ✅ Check firmware size (does it fit in target bank? ≤256KB?)
- ⚠️ Version check is optional (some systems check version > current, but for learning we'll skip this)
- ✅ Total chunks calculation: `total_chunks = (firmware_size + OTA_CHUNK_SIZE - 1) / OTA_CHUNK_SIZE`
- ✅ Target bank (must be the INACTIVE bank, not the one you're running from!)
- ✅ Send ACK back

- Device (STM32) transitions from IDLE → RECEIVING_HEADER
  when it receives START
- Device sends ACK, then transitions to RECEIVING_DATA
- Host waits for ACK before sending data

The device controls its own state, not waiting for host confirmation.

### 2. DATA Packet Handling

- Device sends NACK with error code
- Host is responsible for retrying

Data should be written directly to flash, because:

- RAM available: ~256KB total (but OS, stack, heap use most)
- Firmware size: Up to 256KB
- Math: Can't fit in RAM!

1. Receive chunk in small UART buffer (~2KB)
2. Verify chunk CRC
3. Write chunk directly to Bank B flash
4. Send ACK
5. Ready for next chunk

### 3. After All Chunks ✅ (Excellent!)

**Verify entire firmware:** ✅ Calculate CRC32 of all data written to Bank B, compare with expected

**Check total size:** ✅ Good idea! `chunks_received * chunk_size ≈ firmware_size`

**If verification fails:** You said "start over seems inefficient" - **You're absolutely right!**

**Better approach:**

If final CRC fails:

1. Don't erase Bank B yet
2. Send detailed error to host
3. Host can:
   a) Retry transfer (overwrite Bank B)
   b) Abort
4. Only erase Bank B if starting new OTA or if host aborts

### 4. Error Handling ✅ (Good thinking!)

**Retry:** ✅ Yes, but HOST retries, not device. Device just reports errors.

**Erase Bank B:** You asked when to erase - **Excellent question!**

**Erase Bank B in these cases:**

1. **Start of new OTA** (before receiving any data)
2. **User explicitly aborts** (host sends ABORT packet)
3. **NOT after every error** (too slow, wears flash)

**Error codes:** ✅ Yes! Already defined in the header:

- `OTA_ERR_CRC` - Chunk CRC mismatch
- `OTA_ERR_SIZE` - Firmware too large
- `OTA_ERR_FLASH` - Flash write failed
- `OTA_ERR_SEQUENCE` - Wrong chunk number

## Refined State Machine

Here's the correct flow:

```
[IDLE]
  ↓ Receive START packet
  ↓ Validate: size, target bank
  ↓ Erase target bank
  ↓ Send ACK (or NACK if validation fails)
[RECEIVING_DATA]
  ↓ Receive DATA packet
  ↓ Check: chunk_number == expected
  ↓ Verify: chunk CRC
  ↓ Write to flash (Bank B)
  ↓ Send ACK (or NACK with error)
  ↓ Increment expected chunk number
  ↓ Repeat until all chunks received
[VERIFYING]
  ↓ Calculate CRC32 of entire Bank B firmware
  ↓ Compare with START packet's firmware_crc32
  ↓ If match → FINALIZING, else → ERROR
[FINALIZING]
  ↓ Update boot_state: mark Bank B as VALID
  ↓ Send final ACK
  ↓ Optionally: trigger watchdog reset to boot new firmware
[COMPLETE]

[ERROR]
  ↓ Send NACK with error code
  ↓ Return to IDLE (ready for retry)
```

## Implementation

Let's create `ota_manager.h`:

```c
#ifndef OTA_MANAGER_H
#define OTA_MANAGER_H

#include "ota_protocol.h"
#include <stdint.h>

// OTA state machine states
typedef enum {
    OTA_STATE_IDLE,
    OTA_STATE_RECEIVING_HEADER,
    OTA_STATE_RECEIVING_DATA,
    OTA_STATE_VERIFYING,
    OTA_STATE_FINALIZING,
    OTA_STATE_COMPLETE,
    OTA_STATE_ERROR
} ota_state_t;

// OTA context - keeps track of transfer progress
typedef struct {
    ota_state_t state;
    uint32_t target_bank_address;
    uint32_t firmware_size;
    uint32_t firmware_version;
    uint32_t firmware_crc32;
    uint32_t total_chunks;
    uint32_t chunks_received;
    uint32_t expected_chunk_number;
    uint32_t bytes_written;
    uint8_t error_code;
} ota_context_t;

// Public API
void ota_init(ota_context_t *ctx);
void ota_process_start_packet(ota_context_t *ctx, const ota_start_packet_t *pkt);
void ota_process_data_packet(ota_context_t *ctx, const ota_data_packet_t *pkt);
void ota_process_end_packet(ota_context_t *ctx, const ota_end_packet_t *pkt);
void ota_send_response(const ota_context_t *ctx, uint8_t packet_type);

#endif
```

First, implement `ota_init()` in `ota_manager.c`:

```c
void ota_init(ota_context_t *ctx) {
    // TODO: Initialize all fields to safe defaults
    // What should each field be set to?
}
```

What values should you initialize each field to?

### `ota_init`

```c
#include "ota_manager.h"
#include <string.h>

void ota_init(ota_context_t *ctx) {
    ctx->state = OTA_STATE_IDLE;
    ctx->target_bank_address = 0;
    ctx->firmware_size = 0;
    ctx->firmware_version = 0;
    ctx->firmware_crc32 = 0;
    ctx->total_chunks = 0;
    ctx->chunks_received = 0;
    ctx->expected_chunk_number = 0;
    ctx->bytes_written = 0;
    ctx->error_code = OTA_ERR_NONE;
}
```

Or more elegantly using `memset`:

```c
void ota_init(ota_context_t *ctx) {
    memset(ctx, 0, sizeof(ota_context_t));
    ctx->state = OTA_STATE_IDLE;
    // Everything else is already 0 from memset
}
```

### Step 2: START Packet Handler

Now let's implement the most critical function - handling the START packet. This validates the request and prepares for OTA.

**Before I show you the code, let me ask you to think through the validation logic:**

When you receive a START packet, what checks should you perform **in order of importance**?

Here's a framework:

```c
void ota_process_start_packet(ota_context_t *ctx, const ota_start_packet_t *pkt) {
    // Check 1: Are we in the right state?
    // Check 2: Is the magic number correct?
    // Check 3: Is the firmware size valid?
    // Check 4: Is the target bank valid and INACTIVE?
    // Check 5: Calculate expected total chunks

    // If all checks pass:
    //   - Erase target bank
    //   - Update context
    //   - Transition to RECEIVING_DATA
    //   - Send ACK

    // If any check fails:
    //   - Set error code
    //   - Transition to ERROR
    //   - Send NACK
}
```

For "Check 4: Is target bank valid and INACTIVE?" - how do you determine which bank is currently ACTIVE (the one the application is running from)?

**Hint:** Think about the linker script. Your application is linked to start at either `0x08010000` (Bank A) or `0x08050000` (Bank B). How can you detect this at runtime?

```c
// Option 1: Check a memory address
uint32_t current_address = (uint32_t)&main;

// Option 2: Read the Vector Table Offset Register
uint32_t vtor = SCB->VTOR;
```

My question: What is different from reading vector table offset register and checking main function memory?

-> The Vector Table Offset Register (VTOR) tells the CPU where the interrupt vector table is located. This is **always** set to the start address of your application.

**Key insight:** Remember in your `jump_to_application()` function, you have this line:

```c
SCB->VTOR = app_address;  // Set vector table to application's start
```

This means:

- When bootloader jumps to Bank A (0x08010000), it sets `VTOR = 0x08010000`
- When bootloader jumps to Bank B (0x08050000), it sets `VTOR = 0x08050000`

**VTOR is the source of truth** for where the application is running from.

Why VTOR is better:

1. Always accurate - CPU uses this register to find interrupts
2. Compiler-independent - doesn't depend on optimization
3. Standard practice - this is how real bootloaders determine running
   bank
4. Direct from hardware - reads from CPU register, not code placement

Let's add this helper function to `ota_manager.c`:

```c
/**
 * @brief Get the currently active bank address
 * @return Bank A or Bank B address, or 0 if unknown
 */
static uint32_t ota_get_current_bank(void) {
    uint32_t vtor = SCB->VTOR;

    if (vtor == BANK_A_ADDRESS) {
        return BANK_A_ADDRESS;
    } else if (vtor == BANK_B_ADDRESS) {
        return BANK_B_ADDRESS;
    }

    return 0;  // Unknown/invalid
}

/**
 * @brief Get the inactive bank address (for OTA target)
 * @return Inactive bank address, or 0 if can't determine
 */
static uint32_t ota_get_inactive_bank(void) {
    uint32_t current = ota_get_current_bank();

    if (current == BANK_A_ADDRESS) {
        return BANK_B_ADDRESS;
    } else if (current == BANK_B_ADDRESS) {
        return BANK_A_ADDRESS;
    }

    return 0;  // Error
}
```

Why do we need `ota_get_inactive_bank()`?

Think about this: If you're running from Bank A and doing OTA, you should write to Bank B (the inactive one). You can't overwrite the bank you're currently executing from!

Now let's implement the START packet handler:

```c
if (pkt->firmware_size == 0 || pkt->firmware_size > 262144) {
    printf("ERROR: Invalid firmware size: %lu\r\n", pkt->firmware_size);
    ctx->error_code = OTA_ERR_SIZE;
    ctx->state = OTA_STATE_ERROR;
    ota_send_response(ctx, OTA_PKT_NACK);
    return;
}
```

Instead of using 262144 (=256 \* 1024 bytes), we can define it as a constant in `boot_state.h`:

```c
#define BANK_SIZE  (256 * 1024)  // 256KB
```

And then, use it as:

```c
if (pkt->firmware_size == 0 || pkt->firmware_size > BANK_SIZE) {
...
```

## Question 2: Why must target bank be inactive?

Think about what happens if you write to the ACTIVE bank:

Your application is running from Bank A (0x08010000)
Your code instructions are stored at Bank A
You start OTA update and write NEW firmware to Bank A

What happens?

Step 1: Your code executes instruction at 0x08010100
Step 2: OTA writes new data to 0x08010100
Step 3: Your code tries to execute the NEXT instruction at 0x08010104
↑ This instruction is now DIFFERENT (from new firmware!)
Step 4: CPU executes garbage/wrong instruction
Step 5: CRASH! 💥

Analogy: Imagine you're reading a book, and someone starts erasing and rewriting the pages WHILE you're reading it. The words would change mid-sentence!

**The correct approach:**

Current state:

- Bank A: Running application (v1.0) ← You are HERE
- Bank B: Empty or old firmware

OTA Process:

1. Write NEW firmware (v2.0) to Bank B ← SAFE, not executing from here
2. Verify Bank B is correct
3. Update boot_state: active_bank = BANK_B
4. Reboot
5. Bootloader boots from Bank B (v2.0)

New State:

- Bank A: Old firmware (v1.0)
- Bank B: Running application (v2.0) <- you are HERE now

Next OTA:

- Write to Bank A (now inactive)
- And so on...

-> It's alternating between banks.

```c
// Check 4: Target bank must be the INACTIVE bank
uint32_t inactive_bank = ota_get_inactive_bank();

if (inactive_bank == 0) {
    printf("ERROR: Cannot determine current bank\r\n");
    ctx->error_code = OTA_ERR_SEQUENCE;
    ctx->state = OTA_STATE_ERROR;
    ota_send_response(ctx, OTA_PKT_NACK);
    return;
}

// Verify the requested target bank matches the inactive bank
uint32_t requested_bank = (pkt->target_bank == BANK_A) ? BANK_A_ADDRESS : BANK_B_ADDRESS;

if (requested_bank != inactive_bank) {
    printf("ERROR: Target bank must be inactive bank\r\n");
    printf("  Current (active): 0x%08lX\r\n", ota_get_current_bank());
    printf("  Requested target: 0x%08lX\r\n", requested_bank);
    printf("  Required (inactive): 0x%08lX\r\n", inactive_bank);
    ctx->error_code = OTA_ERR_SEQUENCE;
    ctx->state = OTA_STATE_ERROR;
    ota_send_response(ctx, OTA_PKT_NACK);
    return;
}

ctx->target_bank_address = inactive_bank;
printf("Target bank set to: 0x%08lX\r\n", ctx->target_bank_address);
```

---

## Question 3: Bank Erasing

You asked: **Which sectors need to be erased for Bank A? For Bank B?**

Let's look at your memory map:

```
Bank A: 0x08010000 - 0x0804FFFF (256KB)
  Sector 4: 0x08010000 - 0x0801FFFF (64KB)
  Sector 5: 0x08020000 - 0x0803FFFF (128KB)
  Sector 6: 0x08040000 - 0x0805FFFF (128KB) - only first 64KB

Bank B: 0x08050000 - 0x0808FFFF (256KB)
  Sector 6: 0x08040000 - 0x0805FFFF (128KB) - only last 64KB
  Sector 7: 0x08060000 - 0x0807FFFF (128KB)
  Sector 8: 0x08080000 - 0x0809FFFF (128KB) - only first 64KB
```

**So for Bank A, erase sectors: 4, 5, and part of 6**
**For Bank B, erase sectors: part of 6, 7, and part of 8**

**But wait!** Sector 6 is SHARED between Bank A and Bank B! This is a problem.

**Better approach:** Adjust your memory map to align with sector boundaries:

```
Bootloader: 0x08000000 - 0x0800FFFF (Sectors 0-3, 64KB total)
Bank A:     0x08010000 - 0x0803FFFF (Sectors 4-5, 192KB)
Bank B:     0x08040000 - 0x0806FFFF (Sectors 6-7, 256KB)
State:      0x08080000 - 0x0809FFFF (Sector 8, 128KB)
```

For simplicity in learning, let's use this l cleaner map:

```c
// In boot_state.h - UPDATE these definitions
#define BANK_A_ADDRESS      0x08010000  // Sector 4-5 (192KB)
#define BANK_B_ADDRESS      0x08040000  // Sector 6-7 (256KB)
#define BOOT_STATE_ADDRESS  0x08080000  // Sector 8
```

Now erasing is clean:

- **Bank A:** Erase sectors 4, 5
- **Bank B:** Erase sectors 6, 7

```c
/**
 * @brief Erase a bank's flash sectors
 * @param bank_address Starting address of bank (BANK_A_ADDRESS or BANK_B_ADDRESS)
 * @return 0 on success, -1 on failure
 */
int ota_erase_bank(uint32_t bank_address) {
    printf("Erasing bank at 0x%08lX...\r\n", bank_address);

    HAL_FLASH_Unlock();

    FLASH_EraseInitTypeDef erase_config;
    erase_config.TypeErase = FLASH_TYPEERASE_SECTORS;
    erase_config.VoltageRange = FLASH_VOLTAGE_RANGE_3;

    uint32_t sector_error = 0;

    if (bank_address == BANK_A_ADDRESS) {
        // Erase sectors 4-5
        erase_config.Sector = FLASH_SECTOR_4;
        erase_config.NbSectors = 2;  // Sectors 4, 5
    } else if (bank_address == BANK_B_ADDRESS) {
        // Erase sectors 6-7
        erase_config.Sector = FLASH_SECTOR_6;
        erase_config.NbSectors = 2;  // Sectors 6, 7
    } else {
        HAL_FLASH_Lock();
        return -1;  // Invalid bank
    }

    HAL_StatusTypeDef status = HAL_FLASHEx_Erase(&erase_config, &sector_error);

    HAL_FLASH_Lock();

    if (status != HAL_OK) {
        printf("ERROR: Erase failed! Sector error: %lu\r\n", sector_error);
        return -1;
    }

    printf("Bank erased successfully!\r\n");
    return 0;
}
```

Now let's add this erase call to your START packet handler:

```c
// Erase the target bank
if (ota_erase_bank(ctx->target_bank_address) != 0) {
    printf("ERROR: Failed to erase target bank\r\n");
    ctx->error_code = OTA_ERR_FLASH;
    ctx->state = OTA_STATE_ERROR;
    ota_send_response(ctx, OTA_PKT_NACK);
    return;
}
```

Let's add `ota_send_response()` to `ota_manager.c`:

```c
extern UART_HandleTypeDef huart1;  // Assuming you use UART1, adjust if different

void ota_send_response(const ota_context_t *ctx, uint8_t packet_type) {
    ota_response_packet_t response;

    response.magic = OTA_MAGIC_START;
    response.packet_type = packet_type;
    response.error_code = ctx->error_code;
    response.last_chunk_received = ctx->chunks_received;

    // Send response packet over UART
    HAL_UART_Transmit(&huart1, (uint8_t*)&response, sizeof(response), 1000);

    if (packet_type == OTA_PKT_ACK) {
        printf("Sent ACK (chunks received: %lu)\r\n", ctx->chunks_received);
    } else {
        printf("Sent NACK (error code: %d)\r\n", ctx->error_code);
    }
}
```

Question: Why do we send `last_chunk_received` in the response?

-> If the host sends chunk 5, then the device only received chunks 0-3, then the `last_chunk_received` will be 3. Now, if the host wants to resume, it can recall the `last_chunk_received` which is 3, and start from the next chunk we're waiting for, which is 3+1=4.

Again,

- `last_chunk_received` = highest successfully received chunk
- Resume point = `last_chunk_received + 1`

## Step 3: Implement DATA Packet Handler

Now let's handle the incoming firmware data! This is the heart of the OTA process.

Here is the framework with todos:

```c
void ota_process_data_packet(ota_context_t *ctx, const ota_data_packet_t *pkt) {
    // Check 1: Are we in RECEIVING_DATA state?
    if (ctx->state != OTA_STATE_RECEIVING_DATA) {
        printf("ERROR: Not in RECEIVING_DATA state\r\n");
        ctx->error_code = OTA_ERR_SEQUENCE;
        ctx->state = OTA_STATE_ERROR;
        ota_send_response(ctx, OTA_PKT_NACK);
        return;
    }

    // Check 2: Magic number
    if (pkt->magic != OTA_MAGIC_DATA) {
        printf("ERROR: Invalid data packet magic\r\n");
        ctx->error_code = OTA_ERR_SEQUENCE;
        ctx->state = OTA_STATE_ERROR;
        ota_send_response(ctx, OTA_PKT_NACK);
        return;
    }

    // Check 3: Is this the expected chunk number?
    if (pkt->chunk_number != ctx->expected_chunk_number) {
        printf("ERROR: Wrong chunk number (expected %lu, got %lu)\r\n",
               ctx->expected_chunk_number, pkt->chunk_number);
        ctx->error_code = OTA_ERR_SEQUENCE;
        ota_send_response(ctx, OTA_PKT_NACK);
        return;
    }

    // Check 4: Verify chunk CRC
    uint32_t calculated_crc = calculate_crc32(pkt->data, pkt->chunk_size);
    if (calculated_crc != pkt->chunk_crc32) {
        printf("ERROR: Chunk CRC mismatch\r\n");
        ctx->error_code = OTA_ERR_CRC;
        ota_send_response(ctx, OTA_PKT_NACK);
        return;
    }

    // Check 5: Validate chunk size
    // TODO: What's a valid chunk size?
    // Hint: Normal chunks are OTA_CHUNK_SIZE, but last chunk might be smaller

    printf("Chunk %lu: %u bytes, CRC OK\r\n",
           pkt->chunk_number, pkt->chunk_size);

    // Write chunk to flash
    // TODO: Implement flash writing
    // Calculate target address: ctx->target_bank_address + (chunk_number * OTA_CHUNK_SIZE)

    // Update context
    ctx->chunks_received++;
    ctx->expected_chunk_number++;
    ctx->bytes_written += pkt->chunk_size;

    // Send ACK
    ota_send_response(ctx, OTA_PKT_ACK);

    // Check if all chunks received
    if (ctx->chunks_received == ctx->total_chunks) {
        printf("All chunks received! Transitioning to VERIFYING...\r\n");
        ctx->state = OTA_STATE_VERIFYING;
    }
}
```

First task is chunk size validation: what should be the valid range for `chunk_size`?
Second task is to write chunk to flash. You need to write`pkt->data` (array of bytes) to flash. Remember from earlier - flash is written in WORDS (4 bytes at a time).

**Question:** How would you implement `ota_write_to_flash()`?
**Hints:**

1. How many full words can you write? `num_words = size / 4`
2. Are there remaining bytes? `remaining = size % 4`
3. For remaining bytes, create a word padded with 0xFF (erased flash value)

This was my code:

My implementation of `ota_write_to_flash` is very straightforward (used array):

```c
static int ota_write_to_flash(uint32_t address, const uint8_t *data, uint16_t size) {
    HAL_FLASH_Unlock();

    // TODO: Write data word by word
    // Handle remaining bytes (if size is not multiple of 4)

    for (int i = 0; i < size / 4; i++) {
        HAL_StatusTypeDef status = HAL_FLASH_Program(
            FLASH_TYPEPROGRAM_WORD,
            address,
            data[i]
        );

        if (status != HAL_OK) {
            HAL_FLASH_Lock();
            return -1;  // Write failed
        }

        address += 4;  // Move to next word
    }
    uint8_t num_words = size / 4;
    uint8_t remaining = size % 4;

    uint8_t last_data[4];
    for (int j = 0; j < 4; j++) {
        if (j < remaining) {
            last_data[j] = data[num_words+j];
        }
        else {
            last_data[j] = 0xFF;
        }
    }
    HAL_StatusTypeDef status = HAL_FLASH_Program(
        FLASH_TYPEPROGRAM_WORD,
        address,
        last_data
    );

    if (status != HAL_OK) {
        HAL_FLASH_Lock();
        return -1;  // Write failed
    }

    HAL_FLASH_Lock();
    return 0;
}
```

### Bug 1: Writing Individual Bytes Instead of Words

Let's look at this line:

```c
HAL_FLASH_Program(FLASH_TYPEPROGRAM_WORD, address, data[i]);
```

**Problem:** `data[i]` gives you ONE BYTE, but `HAL_FLASH_Program` expects a **32-bit word (4 bytes)**!

You need to combine 4 bytes into a word:

```c
uint32_t word = data[i*4] | (data[i*4+1] << 8) | (data[i*4+2] << 16) | (data[i*4+3] << 24);
```

Or use pointer casting (cleaner):

```c
uint32_t word = *((uint32_t*)(&data[i*4]));
```

### Bug 2: Wrong Array Indexing for Remaining Bytes

```c
last_data[j] = data[num_words+j]; // THIS IS WRONG
```

Corrected Implementation would be:

```c
static int ota_write_to_flash(uint32_t address, const uint8_t *data, uint16_t size) {
    HAL_FLASH_Unlock();

    // Write full words
    uint16_t num_words = size / 4;
    for (int i = 0; i < num_words; i++) {
        // Combine 4 bytes into a word
        uint32_t word = *((uint32_t*)(&data[i * 4]));

        HAL_StatusTypeDef status = HAL_FLASH_Program(
            FLASH_TYPEPROGRAM_WORD,
            address,
            word
        );

        if (status != HAL_OK) {
            HAL_FLASH_Lock();
            return -1;
        }

        address += 4;
    }

    // Write remaining bytes (if any)
    uint16_t remaining = size % 4;
    if (remaining > 0) {
        uint8_t last_data[4] = {0xFF, 0xFF, 0xFF, 0xFF};  // Initialize with erased value

        for (int j = 0; j < remaining; j++) {
            last_data[j] = data[num_words * 4 + j];  // Fixed indexing!
        }

        uint32_t last_word = *((uint32_t*)last_data);  // Convert to word

        HAL_StatusTypeDef status = HAL_FLASH_Program(
            FLASH_TYPEPROGRAM_WORD,
            address,
            last_word
        );

        if (status != HAL_OK) {
            HAL_FLASH_Lock();
            return -1;
        }
    }

    HAL_FLASH_Lock();
    return 0;
}
```

Or using, `memcpy`:

```c
static int ota_write_to_flash(uint32_t address, const uint8_t *data, uint16_t size) {
    HAL_FLASH_Unlock();

    uint16_t num_words = size / 4;
    uint16_t remaining = size % 4;

    // Write full words
    const uint32_t *word_ptr = (const uint32_t*)data;
    for (int i = 0; i < num_words; i++) {
        HAL_StatusTypeDef status = HAL_FLASH_Program(
            FLASH_TYPEPROGRAM_WORD,
            address,
            word_ptr[i]
        );

        if (status != HAL_OK) {
            HAL_FLASH_Lock();
            return -1;
        }

        address += 4;
    }

    // Write remaining bytes
    if (remaining > 0) {
        uint32_t last_word = 0xFFFFFFFF;  // Start with erased value
        memcpy(&last_word, &data[num_words * 4], remaining);

        HAL_StatusTypeDef status = HAL_FLASH_Program(
            FLASH_TYPEPROGRAM_WORD,
            address,
            last_word
        );

        if (status != HAL_OK) {
            HAL_FLASH_Lock();
            return -1;
        }
    }

    HAL_FLASH_Lock();
    return 0;
}
```

Now let's complete the DATA packet handler:

Task 1: Add chunk size validation:

```c
// Check 5: Validate chunk size
if (pkt->chunk_size == 0 || pkt->chunk_size > OTA_CHUNK_SIZE) {
    printf("ERROR: Invalid chunk size: %u\r\n", pkt->chunk_size);
    ctx->error_code = OTA_ERR_SIZE;
    ctx->state = OTA_STATE_ERROR;
    ota_send_response(ctx, OTA_PKT_NACK);
    return;
}

// Additional check: Last chunk can be smaller, but not other chunks
if (pkt->chunk_number < ctx->total_chunks - 1) {
    // Not the last chunk - must be full size
    if (pkt->chunk_size != OTA_CHUNK_SIZE) {
        printf("ERROR: Non-last chunk must be %d bytes\r\n", OTA_CHUNK_SIZE);
        ctx->error_code = OTA_ERR_SIZE;
        ctx->state = OTA_STATE_ERROR;
        ota_send_response(ctx, OTA_PKT_NACK);
        return;
    }
}
```

Task 2: Add flash writing:

```c
// Write chunk to flash
uint32_t write_address = ctx->target_bank_address + (pkt->chunk_number * OTA_CHUNK_SIZE);

printf("Writing to 0x%08lX...\r\n", write_address);

if (ota_write_to_flash(write_address, pkt->data, pkt->chunk_size) != 0) {
    printf("ERROR: Flash write failed\r\n");
    ctx->error_code = OTA_ERR_FLASH;
    ctx->state = OTA_STATE_ERROR;
    ota_send_response(ctx, OTA_PKT_NACK);
    return;
}
```

And add both of these to `ota_process_data_packet()` function.

One thing to note: we never used pointer casting into 32bit nor dealt with last chunk. Why so?

`boot_state_t` structure:

```c
typedef struct {
    uint32_t magic_number;      // 4 bytes
    uint32_t bank_a_status;     // 4 bytes
    uint32_t bank_b_status;     // 4 bytes
    uint32_t active_bank;       // 4 bytes
    uint32_t crc32;             // 4 bytes
} boot_state_t;  // Total: 20 bytes = 5 words EXACTLY
```

**Total size:** `sizeof(boot_state_t) = 20 bytes = 5 words`

**Key insight:** `20 % 4 = 0` → **NO remaining bytes!**

The structure is **perfectly word-aligned** by design. We specifically designed it this way to avoid the complexity of handling partial words.

And why no pointer casting in `boot_state_write()`?

```c
uint32_t *data = (uint32_t*)&state_copy;
```

This IS actually pointer casting. We're casting `boot_state_t*` -> `uint32_t*`.

Then:

```c
data[i]
```

Why does `data[i]` work here but not in `ota_write_to_flash()`?

Let's compare:

In `boot_state_write()`:

```c
uint32_t *data = (uint32_t*)&state_copy;  // Points to uint32_t array
data[0] → First uint32_t (magic_number)
data[1] → Second uint32_t (bank_a_status)
data[2] → Third uint32_t (bank_b_status)
// etc.
```

In your original `ota_write_to_flash()`:

```c
const uint8_t *data = ...;  // Points to BYTE array
// data[i] → i-th BYTE (not word!)
```

That's why you needed:

```c
const uint32_t *word_ptr = (const uint32_t*)data;  // Cast to word pointer
word_ptr[i] → i-th WORD ✓
```

**`boot_state_write()`:**

- Input: `boot_state_t` (already word-aligned structure)
- Size: Always 20 bytes (5 words exactly)
- Remaining bytes: 0
- Cast once: `uint32_t*` and iterate

**`ota_write_to_flash()`:**

- Input: `uint8_t*` (arbitrary byte array)
- Size: Variable (could be 1KB, 500 bytes, 37 bytes, etc.)
- Remaining bytes: Often non-zero
- Must handle: Full words + partial last word

## Visual Example

**Writing `boot_state_t` (20 bytes):**

```
Memory layout:
[Word 0: magic_number    ] ← data[0]
[Word 1: bank_a_status   ] ← data[1]
[Word 2: bank_b_status   ] ← data[2]
[Word 3: active_bank     ] ← data[3]
[Word 4: crc32           ] ← data[4]
```

Loop runs 5 times, writes 5 words exactly. Done!

**Writing OTA chunk (e.g., 1010 bytes):**

```
Memory layout:
[Word 0-251: data        ] ← Full words
[Last word: AA BB XX XX  ] ← Partial! Only 2 bytes valid, pad with 0xFF

1010 bytes = 252 words + 2 remaining bytes
Need special handling for those 2 bytes!
```

Could we simplify?
Yes, we could use the same approach everywhere.

```c
// Unified flash write function (handles any size)
static int write_to_flash_unified(uint32_t address, const void *data, uint16_t size) {
    HAL_FLASH_Unlock();

    const uint32_t *words = (const uint32_t*)data;
    uint16_t num_full_words = size / 4;

    // Write full words
    for (int i = 0; i < num_full_words; i++) {
        if (HAL_FLASH_Program(FLASH_TYPEPROGRAM_WORD, address, words[i]) != HAL_OK) {
            HAL_FLASH_Lock();
            return -1;
        }
        address += 4;
    }

    // Handle remaining bytes (if any)
    uint16_t remaining = size % 4;
    if (remaining > 0) {
        uint32_t last_word = 0xFFFFFFFF;
        memcpy(&last_word, (uint8_t*)data + num_full_words * 4, remaining);

        if (HAL_FLASH_Program(FLASH_TYPEPROGRAM_WORD, address, last_word) != HAL_OK) {
            HAL_FLASH_Lock();
            return -1;
        }
    }

    HAL_FLASH_Lock();
    return 0;
}
```

Then both could use it:

```c
// In boot_state_write():
write_to_flash_unified(BOOT_STATE_ADDRESS, &state_copy, sizeof(boot_state_t));

// In OTA:
write_to_flash_unified(write_address, pkt->data, pkt->chunk_size);
```

The key takeway here, is that `boot_state_t` was **designed** to avoid the "remaining bytes" problem by being perfectly word-aligned.

So, let's unify the write flash methods.

This is the unified function to `ota_manager.c`:

```c
/**
 * @brief Unified flash write function (handles any size)
 * @param address Flash address to write to
 * @param data Pointer to data to write
 * @param size Number of bytes to write
 * @return 0 on success, -1 on failure
 */
static int write_to_flash_unified(uint32_t address, const void *data, uint16_t size) {
    HAL_FLASH_Unlock();

    const uint32_t *words = (const uint32_t*)data;
    uint16_t num_full_words = size / 4;

    // Write full words
    for (int i = 0; i < num_full_words; i++) {
        if (HAL_FLASH_Program(FLASH_TYPEPROGRAM_WORD, address, words[i]) != HAL_OK) {
            HAL_FLASH_Lock();
            return -1;
        }
        address += 4;
    }

    // Handle remaining bytes (if any)
    uint16_t remaining = size % 4;
    if (remaining > 0) {
        uint32_t last_word = 0xFFFFFFFF;
        memcpy(&last_word, (uint8_t*)data + num_full_words * 4, remaining);

        if (HAL_FLASH_Program(FLASH_TYPEPROGRAM_WORD, address, last_word) != HAL_OK) {
            HAL_FLASH_Lock();
            return -1;
        }
    }

    HAL_FLASH_Lock();
    return 0;
}
```

2. Replace `ota_write_to_flash()` calls with `write_to_flash_unified()` in your DATA packet handler.
3. Update `boot_state_write()` in `boot_state.c`:

Replace the manual flash writing loop with:

```c
// In boot_state_write(), replace the HAL_FLASH_Unlock() through HAL_FLASH_Lock() section with:
if (write_to_flash_unified(BOOT_STATE_ADDRESS, &state_copy, sizeof(boot_state_t)) != 0) {
    return -1;
}
```

But another problem shows up: `write_to_flash_unified()` is in `ota_manager.c` but `boot_state_write()` is in `boot_state.c`.

We have two options:
**Option A:** Move `write_to_flash_unified()` to a new file `flash_utils.c` that both can use

**Option B:** Keep separate implementations (they work fine as-is)

For now, le'ts keep it simple for now - **Option B**. The code duplication is minimal and each module is self-contained. You can refactor later if needed.

So just add `write_to_flash_unified()` to `ota_manager.c` and use it in your DATA packet handler. Leave `boot_state.c` as-is.

## Implement END Packet Handler

The END packet signals that all data chunks have been sent. Now we need to:

1. Verify we received all chunks
2. Calculate CRC32 of the entire firmware in flash
3. Compare with expected CRC32
4. Update boot state if verification passes

Add this to `ota_manager.c`:

```c
void ota_process_end_packet(ota_context_t *ctx, const ota_end_packet_t *pkt) {
    printf("\r\n=== OTA END Packet Received ===\r\n");

    // Check 1: Are we in VERIFYING state?
    if (ctx->state != OTA_STATE_VERIFYING) {
        printf("ERROR: Not in VERIFYING state (current: %d)\r\n", ctx->state);
        ctx->error_code = OTA_ERR_SEQUENCE;
        ctx->state = OTA_STATE_ERROR;
        ota_send_response(ctx, OTA_PKT_NACK);
        return;
    }

    // Check 2: Magic number
    if (pkt->magic != OTA_MAGIC_START) {
        printf("ERROR: Invalid END packet magic\r\n");
        ctx->error_code = OTA_ERR_SEQUENCE;
        ctx->state = OTA_STATE_ERROR;
        ota_send_response(ctx, OTA_PKT_NACK);
        return;
    }

    printf("Verifying firmware integrity...\r\n");
    printf("  Expected size: %lu bytes\r\n", ctx->firmware_size);
    printf("  Bytes written: %lu bytes\r\n", ctx->bytes_written);
    printf("  Expected CRC32: 0x%08lX\r\n", ctx->firmware_crc32);

    // Check 3: Verify total bytes written
    if (ctx->bytes_written != ctx->firmware_size) {
        printf("ERROR: Size mismatch!\r\n");
        ctx->error_code = OTA_ERR_SIZE;
        ctx->state = OTA_STATE_ERROR;
        ota_send_response(ctx, OTA_PKT_NACK);
        return;
    }

    // Check 4: Calculate CRC32 of entire firmware in flash
    printf("Calculating firmware CRC32 (this may take a moment)...\r\n");

    uint32_t calculated_crc = ota_calculate_firmware_crc32(
        ctx->target_bank_address,
        ctx->firmware_size
    );

    printf("  Calculated CRC32: 0x%08lX\r\n", calculated_crc);

    // Check 5: Compare CRC32
    if (calculated_crc != ctx->firmware_crc32) {
        printf("ERROR: CRC32 mismatch! Firmware is corrupted.\r\n");
        ctx->error_code = OTA_ERR_CRC;
        ctx->state = OTA_STATE_ERROR;
        ota_send_response(ctx, OTA_PKT_NACK);
        return;
    }

    printf("✓ Firmware verification PASSED!\r\n");

    // Transition to FINALIZING
    ctx->state = OTA_STATE_FINALIZING;

    // Update boot state to mark new firmware as valid
    if (ota_update_boot_state(ctx) != 0) {
        printf("ERROR: Failed to update boot state\r\n");
        ctx->error_code = OTA_ERR_FLASH;
        ctx->state = OTA_STATE_ERROR;
        ota_send_response(ctx, OTA_PKT_NACK);
        return;
    }

    printf("✓ Boot state updated!\r\n");
    printf("✓ OTA update complete!\r\n");
    printf("  New firmware version: %lu\r\n", ctx->firmware_version);
    printf("  Installed at: 0x%08lX\r\n", ctx->target_bank_address);

    ctx->state = OTA_STATE_COMPLETE;
    ota_send_response(ctx, OTA_PKT_ACK);

    printf("\r\nReboot the device to run the new firmware.\r\n");
}
```

## Step 5: Implement Firmware CRC32 Calculation

**This is tricky!** We need to calculate CRC32 of potentially 256KB of data in flash. We can't load it all into RAM.

Strategy: Calculate in chunks.

```c
/**
 * @brief Calculate CRC32 of firmware stored in flash
 * @param address Starting address of firmware
 * @param size Size of firmware in bytes
 * @return CRC32 value
 */
static uint32_t ota_calculate_firmware_crc32(uint32_t address, uint32_t size) {
    __HAL_CRC_DR_RESET(&hcrc);

    const uint32_t BUFFER_SIZE = 1024;  // 1KB buffer
    uint32_t remaining = size;
    uint32_t offset = 0;

    while (remaining > 0) {
        uint32_t chunk_size = (remaining > BUFFER_SIZE) ? BUFFER_SIZE : remaining;

        // Read directly from flash (it's memory-mapped, so we can just read it)
        const uint8_t *flash_data = (const uint8_t*)(address + offset);

        // Calculate CRC for this chunk
        uint32_t num_words = chunk_size / 4;
        if (num_words > 0) {
            if (offset == 0) {
                // First chunk - use Calculate
                HAL_CRC_Calculate(&hcrc, (uint32_t*)flash_data, num_words);
            } else {
                // Subsequent chunks - use Accumulate
                HAL_CRC_Accumulate(&hcrc, (uint32_t*)flash_data, num_words);
            }
        }

        // Handle remaining bytes in this chunk
        uint32_t chunk_remaining = chunk_size % 4;
        if (chunk_remaining > 0) {
            uint32_t last_word = 0;
            memcpy(&last_word, flash_data + (num_words * 4), chunk_remaining);
            HAL_CRC_Accumulate(&hcrc, &last_word, 1);
        }

        offset += chunk_size;
        remaining -= chunk_size;
    }

    return hcrc.Instance->DR;  // Read final CRC value
}
```

### Step 6: Update Boot State

This function updates the boot state to mark the new firmware as valid:

```c
/**
 * @brief Update boot state after successful OTA
 * @param ctx OTA context
 * @return 0 on success, -1 on failure
 */
static int ota_update_boot_state(const ota_context_t *ctx) {
    boot_state_t new_state;

    // Determine which bank we just updated
    uint32_t updated_bank;
    if (ctx->target_bank_address == BANK_A_ADDRESS) {
        updated_bank = BANK_A;
    } else {
        updated_bank = BANK_B;
    }

    // Create new boot state
    new_state.magic_number = BOOT_STATE_MAGIC;
    new_state.active_bank = updated_bank;  // Switch to new bank
    new_state.crc32 = 0;  // Will be calculated by boot_state_write

    // Mark updated bank as VALID
    if (updated_bank == BANK_A) {
        new_state.bank_a_status = BANK_STATUS_VALID;
        new_state.bank_b_status = BANK_STATUS_INVALID;  // Old firmware
    } else {
        new_state.bank_a_status = BANK_STATUS_INVALID;  // Old firmware
        new_state.bank_b_status = BANK_STATUS_VALID;
    }

    // Erase and write boot state
    if (boot_state_erase() != 0) {
        return -1;
    }

    if (boot_state_write(&new_state) != 0) {
        return -1;
    }

    return 0;
}
```

Look at the `ota_calculate_firmware_crc32()` function. I'm reading directly from flash using:

c

```c
const uint8_t *flash_data = (const uint8_t*)(address + offset);
```

**Important Question:** Why can we read flash like a normal memory pointer, but we can't WRITE to flash this way (we need `HAL_FLASH_Program`)?

It's important to understand why we do in these three steps:

- **Erase entire bank** (set all to 0xFF)
- **Write chunks** (change 1s to 0s as needed with `HAL_FLASH_Program`)
- **Read for verification** (simple memory read - instant!)

Once you've added:

1. `ota_process_end_packet()`
2. `ota_calculate_firmware_crc32()`
3. `ota_update_boot_state()`

Let's create a simple test to simulate the entire OTA process.

We'll simulate an OTA update by:

1. Creating a fake "firmware binary" in RAM
2. Packaging it into OTA packets
3. Feeding those packets to your OTA manager
4. Verifying the entire flow works

We need a Python script on the host side to actually send real firmware. For now, let's create an **embedded self-test** that simulates receiving packets.

### Step 1: Create Test Firmware Data

Let's add this test code to application's `main.c`:

```c
#include "ota_manager.h"
#include "boot_state.h"

/**
 * @brief Simulate OTA update with fake firmware
 */
void test_ota_simulation(void) {
    printf("\r\n");
    printf("========================================\r\n");
    printf("    OTA SIMULATION TEST\r\n");
    printf("========================================\r\n");

    // Step 1: Create fake firmware data
    printf("\n--- Step 1: Creating fake firmware ---\r\n");

    #define TEST_FIRMWARE_SIZE  (5 * 1024)  // 5KB test firmware
    uint8_t *test_firmware = malloc(TEST_FIRMWARE_SIZE);

    if (test_firmware == NULL) {
        printf("ERROR: Failed to allocate memory for test firmware\r\n");
        return;
    }

    // Fill with recognizable pattern
    for (int i = 0; i < TEST_FIRMWARE_SIZE; i++) {
        test_firmware[i] = (uint8_t)(i & 0xFF);  // 0x00, 0x01, 0x02... 0xFF, 0x00...
    }

    printf("Test firmware created: %d bytes\r\n", TEST_FIRMWARE_SIZE);

    // Calculate CRC32 of test firmware
    uint32_t firmware_crc = calculate_crc32(test_firmware, TEST_FIRMWARE_SIZE);
    printf("Test firmware CRC32: 0x%08lX\r\n", firmware_crc);

    // Step 2: Initialize OTA context
    printf("\n--- Step 2: Initializing OTA ---\r\n");
    ota_context_t ota_ctx;
    ota_init(&ota_ctx);
    printf("OTA context initialized\r\n");

    // Step 3: Send START packet
    printf("\n--- Step 3: Sending START packet ---\r\n");

    uint32_t total_chunks = (TEST_FIRMWARE_SIZE + OTA_CHUNK_SIZE - 1) / OTA_CHUNK_SIZE;

    ota_start_packet_t start_pkt = {
        .magic = OTA_MAGIC_START,
        .packet_type = OTA_PKT_START,
        .firmware_size = TEST_FIRMWARE_SIZE,
        .firmware_version = 0x00020000,  // Version 2.0.0
        .firmware_crc32 = firmware_crc,
        .total_chunks = total_chunks,
        .target_bank = BANK_B  // We're running from Bank A, update Bank B
    };

    ota_process_start_packet(&ota_ctx, &start_pkt);

    if (ota_ctx.state != OTA_STATE_RECEIVING_DATA) {
        printf("ERROR: START packet failed! State: %d\r\n", ota_ctx.state);
        free(test_firmware);
        return;
    }

    printf("START packet accepted. Ready to receive %lu chunks\r\n", total_chunks);

    // Step 4: Send DATA packets
    printf("\n--- Step 4: Sending DATA packets ---\r\n");

    for (uint32_t chunk_num = 0; chunk_num < total_chunks; chunk_num++) {
        ota_data_packet_t data_pkt;

        data_pkt.magic = OTA_MAGIC_DATA;
        data_pkt.packet_type = OTA_PKT_DATA;
        data_pkt.chunk_number = chunk_num;

        // Calculate chunk size (last chunk might be smaller)
        uint32_t offset = chunk_num * OTA_CHUNK_SIZE;
        uint32_t remaining = TEST_FIRMWARE_SIZE - offset;
        data_pkt.chunk_size = (remaining > OTA_CHUNK_SIZE) ? OTA_CHUNK_SIZE : remaining;

        // Copy chunk data
        memcpy(data_pkt.data, test_firmware + offset, data_pkt.chunk_size);

        // Calculate chunk CRC
        data_pkt.chunk_crc32 = calculate_crc32(data_pkt.data, data_pkt.chunk_size);

        // Process the packet
        ota_process_data_packet(&ota_ctx, &data_pkt);

        if (ota_ctx.state == OTA_STATE_ERROR) {
            printf("ERROR: DATA packet %lu failed!\r\n", chunk_num);
            free(test_firmware);
            return;
        }

        // Print progress every 10 chunks
        if ((chunk_num + 1) % 10 == 0 || chunk_num == total_chunks - 1) {
            printf("Progress: %lu/%lu chunks (%lu%%)\r\n",
                   chunk_num + 1,
                   total_chunks,
                   ((chunk_num + 1) * 100) / total_chunks);
        }
    }

    if (ota_ctx.state != OTA_STATE_VERIFYING) {
        printf("ERROR: Not in VERIFYING state after all chunks! State: %d\r\n", ota_ctx.state);
        free(test_firmware);
        return;
    }

    printf("All DATA packets sent successfully!\r\n");

    // Step 5: Send END packet
    printf("\n--- Step 5: Sending END packet ---\r\n");

    ota_end_packet_t end_pkt = {
        .magic = OTA_MAGIC_START,
        .packet_type = OTA_PKT_END
    };

    ota_process_end_packet(&ota_ctx, &end_pkt);

    if (ota_ctx.state != OTA_STATE_COMPLETE) {
        printf("ERROR: END packet failed! State: %d\r\n", ota_ctx.state);
        free(test_firmware);
        return;
    }

    printf("END packet processed successfully!\r\n");

    // Step 6: Verify boot state was updated
    printf("\n--- Step 6: Verifying boot state ---\r\n");

    boot_state_t state;
    if (boot_state_read(&state) == 0) {
        printf("Boot state updated:\r\n");
        printf("  Active bank: %s\r\n", state.active_bank == BANK_A ? "Bank A" : "Bank B");
        printf("  Bank A status: %s\r\n", state.bank_a_status == BANK_STATUS_VALID ? "VALID" : "INVALID");
        printf("  Bank B status: %s\r\n", state.bank_b_status == BANK_STATUS_VALID ? "VALID" : "INVALID");
    } else {
        printf("ERROR: Failed to read boot state\r\n");
    }

    // Cleanup
    free(test_firmware);

    printf("\r\n========================================\r\n");
    printf("✓ OTA SIMULATION TEST COMPLETE!\r\n");
    printf("========================================\r\n");
    printf("\nNext steps:\r\n");
    printf("1. Reset the device\r\n");
    printf("2. Bootloader should boot from Bank B\r\n");
    printf("3. Verify new firmware is running\r\n");
}
```

### Step 2: Add `calculate_crc32` to Application

**Since `calculate_crc32()` is static in `ota_manager.c`, you need to either:**

**Option A: Make it public**

In `ota_manager.h`:

```c
uint32_t calculate_crc32(const void *data, size_t length);
```

In `ota_manager.c`, remove `static`:

```c
uint32_t calculate_crc32(const void *data, size_t length) {
    // ... existing implementation
}
```

**Option B: Duplicate in main.c (quick and dirty for testing)**

Just copy the `calculate_crc32()` function to your `main.c`.

### Step 3: Update Application `main`

```c
int main(void)
{
    HAL_Init();
    SystemClock_Config();
    MX_GPIO_Init();
    MX_USART1_UART_Init();
    MX_CRC_Init();  // Important!

    printf("\r\n========================================\r\n");
    printf("    APPLICATION v1.0\r\n");
    printf("========================================\r\n");
    printf("Running from: 0x%08lX\r\n", SCB->VTOR);

    // Wait a bit for user
    HAL_Delay(2000);

    // Run OTA simulation test
    test_ota_simulation();

    // Normal application loop
    while (1) {
        HAL_GPIO_TogglePin(GPIOG, GPIO_PIN_13);
        HAL_Delay(1000);
    }
}
```

---

## What This Test Does:

1. ✅ Creates 5KB of test data with a recognizable pattern
2. ✅ Calculates CRC32 of the test firmware
3. ✅ Simulates START packet
4. ✅ Simulates multiple DATA packets (5 chunks of 1KB each)
5. ✅ Simulates END packet
6. ✅ Verifies firmware CRC32
7. ✅ Updates boot state to switch to Bank B
8. ✅ Prints results

---

## Expected Output

```
========================================
    OTA SIMULATION TEST
========================================

--- Step 1: Creating fake firmware ---
Test firmware created: 5120 bytes
Test firmware CRC32: 0x????????

--- Step 2: Initializing OTA ---
OTA context initialized

--- Step 3: Sending START packet ---
=== OTA START Packet Received ===
Target bank set to: 0x08050000
Erasing bank at 0x08050000...
Bank erased successfully!
Ready to receive firmware!
Sent ACK (chunks received: 0)
START packet accepted. Ready to receive 5 chunks

--- Step 4: Sending DATA packets ---
Chunk 0: 1024 bytes, CRC OK
Writing to 0x08050000...
Sent ACK (chunks received: 1)
...
Progress: 5/5 chunks (100%)
All chunks received! Transitioning to VERIFYING...

--- Step 5: Sending END packet ---
=== OTA END Packet Received ===
Verifying firmware integrity...
Calculating firmware CRC32...
✓ Firmware verification PASSED!
✓ Boot state updated!
✓ OTA update complete!

--- Step 6: Verifying boot state ---
Boot state updated:
  Active bank: Bank B
  Bank A status: INVALID
  Bank B status: VALID

✓ OTA SIMULATION TEST COMPLETE!
```

We still need to implement...

- Real UART communication with host PC
- Python script to send actual firmware files

And we haven't started:

- Phase 6: Verification & Rollback
- Phase 7: Polish and implement real OTA
