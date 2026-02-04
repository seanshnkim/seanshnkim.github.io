---
layout: post
title: "Bootloader with OTA Phase 5: OTA Protocol Implementation - Part 1"
dat: 2026-01-27 21:14:50
categories: Firmware
---

## Before We Dive In

Phase 5 was particularly challenging to organize as a blog post. The code implementation was overwhelming, and I spent a few days thinking about how to convey my project's core features without getting bogged down in code details. Should I explain the code line by line? I could do that. But that would make this section so long I'd need 4-5 additional posts just for Phase 5. And it wouldn't be very fun to read all those articles.

So here's my approach: I'll split Phase 5 into two parts. The first part explains high-level concepts using illustrations (although it doesn't mean that it is without any code). The second part dives into the code, but I'll focus only on the essence of it.

## Phase 5 Overview

In Phase 5, we will actually build the code that transfers new firmware to our device. For this, we will explore a somewhat complex yet interesting packet-based protocol. We'll also learn new concepts, such as file chunking, per-chunk CRC verification, flash writes during transfer, and retransmission logic.

Phase 5's new header/ source code files:

- `ota_protocol.h`: Defines the OTA packet structure and protocol constants. Specifies packet types (START, DATA, END, ACK/NACK), magic numbers for validation, error codes, and the exact binary layout of each packet.
- `ota_manager.h` / `ota_manager.c`: Implements the core OTA state machine and business logic. Maintains the transfer context (which chunk we're on, how many bytes written, CRC values), processes incoming packets, performs CRC verification, writes data to flash, and manages state transitions.
- `ota_uart.h`: Handles the low-level UART communication layer. For convenience, I first built and tested OTA protocol with UART. I will cover the OTA protocol development with BLE (Bluetooth) in a separate post.

## Packet: Why Send Data in Chunks?

{% include figure.liquid
   loading="eager"
   path="/assets/post-attachments/2026-01-27/packet_simple.png"
   class="img-fluid rounded z-depth-1 figure-lines"
   %}<br>

In OTA firmware update, host must send firmware data to the device. What's the best way to transfer data? Should we send it as raw byte stream? Or blast the entire firmware file in one shot?

Neither approach is practical. Here's why:

- If it's sent in a blast, the entire firmware might get ruined if even a single bit gets corrupted during transmission.
- There is no way to know where the error occurred. Plus, it must restart the entire transfer from scratch -> very inefficient!
- The receiver has no way to track progress or detect if transmission stalled.

That's why we break the target file into fixed-size chunks called **packets**. Each packet is a self-contained unit that includes:

- Metadata: "Data about the data itself". Packet number, size, target bank (which bank should it write to?)
- CRC Checksum: The receiver verifies if the current chunk is corrupted by calculating a special number called "checksum" (mentioned in Phase 3, [^1])
- Packet Type: Tells the receiver what kind of data this packet is (START / DATA / END)

_For those who majored in CS and took courses in computer networks or internet protocols, my explanation might sound unnecessarily long-winded. After all, the idea of "data chunks" repeatedly appears under different names - like a packet at the network layer, a frame at the data link layer, or a datagram at the transport layer._

Anyways, packet sorts out all the problems. We only have to detect errors per chunk - and if it's corrupt, retransmit only that packet, not the entire firmware. Progress tracking becomes available, flow control (ACK/NACK response), and even robustness of connection (we know exactly where to resume).

{% include figure.liquid
   loading="eager"
   path="/assets/post-attachments/2026-01-27/packet_explained.png"
   class="img-fluid rounded z-depth-1 figure-lines"
   %}<br>

## What Information Does A Packet Contain?

Now that we understand why packets are necessary, let's examine what information they should carry for OTA firmware updates.

{% include figure.liquid
   loading="eager"
   path="/assets/post-attachments/2026-01-27/packet_type.png"
   class="img-fluid rounded z-depth-1 figure-lines"
   %}<br>

### 1. START Packet

Let's begin with the START packet. Every packet must identify its type, and the START packet has additional responsiblity: it carries the overall metadata about the firmware being transferred.

{% include figure.liquid
   loading="eager"
   path="/assets/post-attachments/2026-01-27/firmware_info.png"
   class="img-fluid rounded z-depth-1 figure-lines"
   %}<br>

**Firmware size and chunk count**: The device needs to know how large the incoming firmware is and how many chunks expect. The device can track progress ("I received 150 out of chunks now"), and detect when the transfer is complete.

**Target bank**: To which bank should the device write new firmware? The START packet specifies whether to write to Bank A or Bank B. It prevents accidental overwrites. And remember from Phase 3 that the key feature of our dual bank system is to **keep the old firmware safe while updating the other bank**.

{% include figure.liquid
   loading="eager"
   path="/assets/post-attachments/2026-01-27/bank_type.png"
   class="img-fluid rounded z-depth-1 figure-lines"
   %}<br>

**Firmware version**: The version helps with tracking and debugging. You want to make sure if your updating firmware to the right version before initiating transmission.

**Magic number and CRC32**: Both are for verification or integrity check. Each concept and difference have been already covered in Phase 3.

All combined, the START packet is represented as a struct:

```c
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
```

_The `__attribute__((packed))` directive is tells the compiler not to add any padding between fields. This ensures the binary layout matches exactly on both host and device, regardless of their architectures._

### 2. DATA Packet

`DATA` packet is where the actual firmware bytes live. Each data packet contains:

**Chunk number**: A sequential index (0, 1, 2, ...) that allows the device to detect missing or out-of-order packets.

**Chunk size**: While most chunks are the maximum size (e.g., 1024 bytes), the _last_ chunk might be smaller. For example, if the firmware is 50,000 bytes and chunks are 1024 bytes, the final chunk will only be 928 bytes (50,000 - 48 × 1024). The device needs this information to avoid writing garbage padding to flash.

**Chunk CRC32**: Each chunk has its own checksum. This enables immediate error detection and the device doesn't have to wait until the end to discover corruption. If chunk 150's CRC fails, we can retransmit just that one chunk instead of the entire firmware.

**Data**: The actual firmware bytes for this chunk.

```c
// DATA packet: Contains one chunk of firmware
typedef struct {
    uint32_t magic;              // OTA_MAGIC_DATA
    uint8_t packet_type;         // OTA_PKT_DATA
    uint32_t chunk_number;       // Sequential chunk number (0-based)
    uint16_t chunk_size;         // Size of data in this chunk (≤ OTA_CHUNK_SIZE)
    uint32_t chunk_crc32;        // CRC32 of this chunk's data
    uint8_t data[OTA_CHUNK_SIZE]; // Actual firmware data
} __attribute__((packed)) ota_data_packet_t;
```

### 3. END Packet

`END` packet signals "It's done. Now let's verify and finalize." That's why it only needs to identify itself (packet type and magic number). All the necessary information was already provided in the START packet.

```c
// END packet: Signals transfer complete
typedef struct {
    uint32_t magic;              // OTA_MAGIC_START
    uint8_t packet_type;         // OTA_PKT_END
} __attribute__((packed)) ota_end_packet_t;
```

Packet struct will be saved in a header file `ota_protocol.h`.

## State Machine

**State machines** was invented to easily model systems that behave differently depending on their current "state" and to formalize the transitions between those states.

To start with a question: how would the device know what to do with incoming data? If random bytes arrive over UART, should it interpret them as start of a new firmware transfer? or a data chunk to write to flash?

That's where the state machine comes in. It provides **context**, meaning it tells the device: "I'm currently in the "receiving data" state, so the next packet I receive should be a data packet containing firmware bytes."

Keep in mind that the states belong to device, not to host.

## How Does State Change?

Here is a diagram that describes the five main states in the OTA update process:

{% include figure.liquid
   loading="eager"
   path="/assets/post-attachments/2026-01-27/five_different_states.png"
   class="img-fluid rounded z-depth-1 figure-lines"
   %}<br>

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

### 1. IDLE -> RECEIVING_DATA

Before anything happens, the device sits in the `IDLE` state. If the host wants to initiate a firmware update, it sends a "START" packet to notify the device.

Upon receiving the START packet, the device runs several validation checks:

- Is the firmware size reasonable? Not too large for the target bank?
- Is the target bank valid? (BANK_A or BANK_B, not some garbage value)
- Is the magic number correct?

If validation passes, the device must **erase the target bank** before accepting any data. (Remember from Phase 4 that flash memory can only fully write after erase)

1. **ACK**: If successfully erased the bank, the device sends an **ACK** (acknowledgment) back to the host and transitions to `RECEIVING_DATA` state.
2. **NACK**: If anything goes wrong (invalid size, erase failure), the device sends a **NACK** (negative acknowledgment) with an error code and remains in `IDLE` state.

{% include figure.liquid
   loading="eager"
   path="/assets/post-attachments/2026-01-27/start_process.png"
   class="img-fluid rounded z-depth-1 figure-lines"
   %}<br>

### 2. RECEIVING_DATA -> VERIFYING

Now the device actively receives firmware chunks.

But again, there are several checks before moving on to actual data transfer - Yes, I know, it's full of verification and checks!

For each DATA packet received:

1. Check: chunk_number == expected_chunk_number
   → Detect missing or out-of-order packets

2. Verify: Calculate CRC32 of data[], compare with chunk_crc32
   → Detect corruption during transmission

3. Write to flash at correct address
   → address = bank_start + (chunk_number × chunk_size)

4. Send ACK (or NACK if any check fails)
   → Give host immediate feedback

5. Increment expected_chunk_number
   → Prepare for next packet

6. Repeat until chunks_received == total_chunks

Once the device has received and written all chunks, it transitions to the `VERIFYING` state for verifying the entire firmware data.

### 3. VERIFYING -> FINALIZING

Even though every individual chunk passed its CRC check, we perform one final integrity verification.

1. Calculate CRC32 of entire firmware in Bank B. Read back what we actually wrote to flash.
2. Compare 1) firmware_crc32 vs. 2) START packet. Does it match what the host sent?
3. If match, then transition to FINALIZING. If mismatch, transition to ERROR

Firmware update must guarantee robustness and integrity of data transfer. It's a final "sanity check" before marking the firmware as valid.

### 4. FINALIZING -> COMPLETE

In the `FINALIZING` state, the device updates the boot state structure:

```c
boot_state.bank_b_status = BANK_STATUS_VALID;
boot_state.bank_b_version = firmware_version;
write_boot_state(&boot_state);
```

Updating the boot state structure means saving the info in persistent storage (flash memory). In the future, when the device reboots, the bootloader will read this changed structure and know that now Bank B contains valid and bootable firmware.

After updating the boot state, the device sends a final **ACK** to the host and transitions to `COMPLETE`. The OTA update is finished! The device can now trigger a reset to boot the new firmware.

### 5. ERROR

In any case where something goes wrong (CRC mismatch, flash write failure, unexpected packet loss or timeout, and so on), the device falls into ERROR state. It sends a NACK with an appropriate error code:

```c
#define OTA_ERR_NONE        0x00
#define OTA_ERR_CRC         0x01  // CRC verification failed
#define OTA_ERR_SIZE        0x02  // Invalid firmware size
#define OTA_ERR_FLASH       0x03  // Flash operation failed
#define OTA_ERR_SEQUENCE    0x04  // Chunk out of order
#define OTA_ERR_TIMEOUT     0x05  // Packet timeout
```

From the `ERROR` stat, the device can either:

1. Return to `IDLE` and wait for the host to retry
2. Stay in `ERROR` and require a manual reset

### Summary

The OTA state information is defined in `ota_manager.h`:

```c
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
```

The same header file also contains "OTA context" information to keep track of information needed during data transfer:

```c
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
```

The context is passed to every function that processes packets, ensuring everyone has access to the current transfer state.

[^1]: https://seanshnkim.github.io/blog/2026/Dual-Bank-Bootloader-OTA-Phase3/, CRC32 (Cyclic Redundancy Check)
