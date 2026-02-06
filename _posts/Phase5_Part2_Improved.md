---
layout: post
title: "Bootloader with OTA Phase 5 - Part 2: Implementation Deep Dive"
date: 2026-01-29 22:10:21
categories: Firmware
---
## Table of Contents
* TOC
{:toc}

## Recap: What We Built in Part 1

In Part 1, we covered the high-level concepts:
1. Why do we use packets for communication? It's because chunking data enables error recovery and progress tracking.
2. What are packet types? START (metadata), DATA (firmware chunks), END (completion signal)
3. State machine flow: IDLE → RECEIVING_DATA → VERIFYING → FINALIZING → COMPLETE

Now in Part 2, we'll implement this protocol. We will heavily focus on the actual code and implementation details.

---

## Architecture Overview

Before diving into code, here is the software architecture of this project:

```
┌─────────────────────────────────────┐
│   Application Layer (main.c)       │  ← HIGH: Triggers OTA, handles results
├─────────────────────────────────────┤
│   OTA Manager (ota_manager.c)      │  ← MIDDLE: State machine, validation
├─────────────────────────────────────┤
│   UART Layer (ota_uart.c)          │  ← LOW: Receives bytes, assembles packets
└─────────────────────────────────────┘
```

처음에 소프트웨어 계층을 나누려는 의도가 있던 건 아니었다. 모듈별로 기능을 나누다보니 저수준의 기능과, 고수준의 기능(application)을 담당하는 모듈이 따로 나눠지는 것 같다. 소프트웨어도 파트마다 역할을 분담하면 추상화가 쉬워지고, 테스트하거나 기능을 porting하기도 쉬워진다.

---

## OTA Manager Layer

The OTA manager is **stateful** and **sequential**. It must:
1. Reject out-of-order packets (e.g., DATA before START)
2. Track progress (which chunk we're expecting)
3. Validate every step (sizes, CRCs, addresses)
4. Update persistent state (boot_state) only after complete success

### The Context Structure: Our Memory

```c
typedef struct {
    ota_state_t state;              // Where are we in the process?
    uint32_t target_bank_address;   // Where to write (Bank A or B)
    uint32_t firmware_size;         // Total bytes expected
    uint32_t firmware_version;      // Version being installed
    uint32_t firmware_crc32;        // Expected final CRC
    uint32_t total_chunks;          // How many chunks total
    uint32_t chunks_received;       // How many we've gotten
    uint32_t expected_chunk_number; // Next chunk we're waiting for
    uint32_t bytes_written;         // Total bytes written to flash
    uint8_t error_code;             // If error, what kind?
} ota_context_t;
```

**Key insight:** This struct is our "working memory" for the entire OTA process. Every function reads from and writes to this context.

### Processing START: Validation and Preparation

When a START packet arrives, we must validate *before* erasing anything:

```c
void ota_process_start_packet(ota_context_t *ctx, const ota_start_packet_t *pkt) {
    printf("=== OTA START Packet Received ===\r\n");
    
    // Validation 1: Are we in the right state?
    if (ctx->state != OTA_STATE_IDLE) {
        printf("ERROR: Not in IDLE state (current: %d)\r\n", ctx->state);
        ctx->state = OTA_STATE_ERROR;
        ctx->error_code = OTA_ERR_SEQUENCE;
        return;
    }
    
    // Validation 2: Is the firmware size reasonable?
    if (pkt->firmware_size == 0 || pkt->firmware_size > (256 * 1024)) {
        printf("ERROR: Invalid firmware size: %lu bytes\r\n", pkt->firmware_size);
        ctx->state = OTA_STATE_ERROR;
        ctx->error_code = OTA_ERR_SIZE;
        return;
    }
    
    // Validation 3: Is target bank valid?
    if (pkt->target_bank != BANK_A && pkt->target_bank != BANK_B) {
        printf("ERROR: Invalid target bank: 0x%02X\r\n", pkt->target_bank);
        ctx->state = OTA_STATE_ERROR;
        ctx->error_code = OTA_ERR_SIZE;
        return;
    }
    
    // Validation 4: Are we trying to overwrite our own running bank?
    uint32_t current_bank = SCB->VTOR;  // Where are we running from?
    uint32_t target_address = (pkt->target_bank == BANK_A) ? BANK_A_ADDRESS : BANK_B_ADDRESS;
    
    if (current_bank == target_address) {
        printf("ERROR: Cannot overwrite running bank!\r\n");
        ctx->state = OTA_STATE_ERROR;
        ctx->error_code = OTA_ERR_SIZE;
        return;
    }
    
    // All validations passed - save metadata
    ctx->target_bank_address = target_address;
    ctx->firmware_size = pkt->firmware_size;
    ctx->firmware_version = pkt->firmware_version;
    ctx->firmware_crc32 = pkt->firmware_crc32;
    ctx->total_chunks = pkt->total_chunks;
    ctx->chunks_received = 0;
    ctx->expected_chunk_number = 0;
    ctx->bytes_written = 0;
    
    printf("Target bank: 0x%08lX\r\n", ctx->target_bank_address);
    printf("Firmware size: %lu bytes\r\n", ctx->firmware_size);
    printf("Expected chunks: %lu\r\n", ctx->total_chunks);
    
    // Erase the target bank (destructive operation - only after validation!)
    if (ota_erase_bank(ctx->target_bank_address) != 0) {
        printf("ERROR: Failed to erase bank\r\n");
        ctx->state = OTA_STATE_ERROR;
        ctx->error_code = OTA_ERR_FLASH;
        return;
    }
    
    printf("Bank erased successfully!\r\n");
    
    // Transition to receiving data
    ctx->state = OTA_STATE_RECEIVING_DATA;
    ota_send_response(ctx, OTA_PKT_ACK);
}
```

**Design decisions explained:**

1. **Validate first, erase last**: Erasing is destructive. If validation fails after erasing, we've lost the old firmware for nothing.
2. **Check running bank**: Overwriting our own code would crash immediately. This check prevents that disaster.
3. **Sequential checks**: We check state → size → bank → running bank. Each check is independent and clear.
4. **Error codes matter**: Different errors get different codes. This helps with debugging and logging.

### Processing DATA: Write and Verify

DATA packets are the workhorse of OTA. We receive potentially hundreds of these:

```c
void ota_process_data_packet(ota_context_t *ctx, const ota_data_packet_t *pkt) {
    // Check 1: Are we in the right state?
    if (ctx->state != OTA_STATE_RECEIVING_DATA) {
        printf("ERROR: Not in RECEIVING_DATA state\r\n");
        ctx->state = OTA_STATE_ERROR;
        ctx->error_code = OTA_ERR_SEQUENCE;
        ota_send_response(ctx, OTA_PKT_NACK);
        return;
    }
    
    // Check 2: Is this the chunk we expected?
    if (pkt->chunk_number != ctx->expected_chunk_number) {
        printf("ERROR: Expected chunk %lu, got %lu\r\n", 
               ctx->expected_chunk_number, pkt->chunk_number);
        ctx->state = OTA_STATE_ERROR;
        ctx->error_code = OTA_ERR_SEQUENCE;
        ota_send_response(ctx, OTA_PKT_NACK);
        return;
    }
    
    // Check 3: Is chunk size reasonable?
    if (pkt->chunk_size == 0 || pkt->chunk_size > OTA_CHUNK_SIZE) {
        printf("ERROR: Invalid chunk size: %u\r\n", pkt->chunk_size);
        ctx->state = OTA_STATE_ERROR;
        ctx->error_code = OTA_ERR_SIZE;
        ota_send_response(ctx, OTA_PKT_NACK);
        return;
    }
    
    // Check 4: Verify chunk CRC
    uint32_t calculated_crc = calculate_crc32(pkt->data, pkt->chunk_size);
    if (calculated_crc != pkt->chunk_crc32) {
        printf("ERROR: Chunk %lu CRC mismatch (expected 0x%08lX, got 0x%08lX)\r\n",
               pkt->chunk_number, pkt->chunk_crc32, calculated_crc);
        ctx->state = OTA_STATE_ERROR;
        ctx->error_code = OTA_ERR_CRC;
        ota_send_response(ctx, OTA_PKT_NACK);
        return;
    }
    
    // All checks passed - write to flash
    uint32_t write_address = ctx->target_bank_address + (pkt->chunk_number * OTA_CHUNK_SIZE);
    
    printf("Chunk %lu: %u bytes, CRC OK, writing to 0x%08lX...\r\n",
           pkt->chunk_number, pkt->chunk_size, write_address);
    
    if (ota_write_to_flash(write_address, pkt->data, pkt->chunk_size) != 0) {
        printf("ERROR: Flash write failed\r\n");
        ctx->state = OTA_STATE_ERROR;
        ctx->error_code = OTA_ERR_FLASH;
        ota_send_response(ctx, OTA_PKT_NACK);
        return;
    }
    
    // Update progress
    ctx->chunks_received++;
    ctx->expected_chunk_number++;
    ctx->bytes_written += pkt->chunk_size;
    
    printf("Progress: %lu/%lu chunks (%lu%%)\r\n",
           ctx->chunks_received, ctx->total_chunks,
           (ctx->chunks_received * 100) / ctx->total_chunks);
    
    // Check if we've received all chunks
    if (ctx->chunks_received >= ctx->total_chunks) {
        printf("All chunks received! Transitioning to VERIFYING...\r\n");
        ctx->state = OTA_STATE_VERIFYING;
    }
    
    ota_send_response(ctx, OTA_PKT_ACK);
}
```

**Why verify CRC per chunk?**
- **Early detection**: Catch corruption immediately, not after 300 chunks
- **Efficient retransmission**: Only resend the bad chunk, not everything
- **Progress confidence**: Each ACK means "this chunk is good and written"

**Why check chunk number sequence?**
- UART doesn't guarantee ordering (though it usually does)
- Protects against duplicate packets or host bugs
- Makes state machine predictable

### Processing END: Final Verification

The END packet triggers our final integrity check:

```c
void ota_process_end_packet(ota_context_t *ctx, const ota_end_packet_t *pkt) {
    printf("=== OTA END Packet Received ===\r\n");
    
    // Must be in VERIFYING state
    if (ctx->state != OTA_STATE_VERIFYING) {
        printf("ERROR: Not in VERIFYING state\r\n");
        ctx->state = OTA_STATE_ERROR;
        ctx->error_code = OTA_ERR_SEQUENCE;
        ota_send_response(ctx, OTA_PKT_NACK);
        return;
    }
    
    // Verify entire firmware CRC
    printf("Verifying firmware integrity...\r\n");
    printf("Calculating CRC32 over %lu bytes...\r\n", ctx->bytes_written);
    
    uint32_t calculated_crc = calculate_crc32(
        (void*)ctx->target_bank_address,
        ctx->bytes_written
    );
    
    printf("Expected CRC32:    0x%08lX\r\n", ctx->firmware_crc32);
    printf("Calculated CRC32:  0x%08lX\r\n", calculated_crc);
    
    if (calculated_crc != ctx->firmware_crc32) {
        printf("ERROR: Firmware CRC mismatch!\r\n");
        ctx->state = OTA_STATE_ERROR;
        ctx->error_code = OTA_ERR_CRC;
        ota_send_response(ctx, OTA_PKT_NACK);
        return;
    }
    
    printf("✓ Firmware verification PASSED!\r\n");
    
    // Update boot state to mark new firmware as valid
    if (ota_update_boot_state(ctx) != 0) {
        printf("ERROR: Failed to update boot state\r\n");
        ctx->state = OTA_STATE_ERROR;
        ctx->error_code = OTA_ERR_FLASH;
        ota_send_response(ctx, OTA_PKT_NACK);
        return;
    }
    
    printf("✓ Boot state updated!\r\n");
    ctx->state = OTA_STATE_COMPLETE;
    ota_send_response(ctx, OTA_PKT_ACK);
    
    printf("✓ OTA update complete!\r\n");
}
```

**Why verify the entire firmware again?**

Even though every chunk passed its CRC:
- Chunks could have been written to wrong addresses
- Flash corruption could occur after writing (rare but possible)
- It's our last line of defense before declaring success

**Think of it like a jigsaw puzzle:** Each piece (chunk) is verified individually, but you still check the complete picture (firmware) at the end.

---

## Critical Helper Functions

### Flash Writing with Alignment

Flash writing isn't as simple as `memcpy()`. We must respect alignment:

```c
static int ota_write_to_flash(uint32_t address, const uint8_t *data, uint16_t size) {
    HAL_FLASH_Unlock();
    
    uint32_t *word_data = (uint32_t*)data;
    uint32_t word_count = size / 4;
    
    // Write full words
    for (uint32_t i = 0; i < word_count; i++) {
        if (HAL_FLASH_Program(FLASH_TYPEPROGRAM_WORD, address, word_data[i]) != HAL_OK) {
            HAL_FLASH_Lock();
            return -1;
        }
        address += 4;
    }
    
    // Handle remaining bytes (if size not word-aligned)
    uint32_t remaining_bytes = size % 4;
    if (remaining_bytes > 0) {
        uint32_t last_word = 0xFFFFFFFF;  // Start with erased value
        memcpy(&last_word, data + (word_count * 4), remaining_bytes);
        
        if (HAL_FLASH_Program(FLASH_TYPEPROGRAM_WORD, address, last_word) != HAL_OK) {
            HAL_FLASH_Lock();
            return -1;
        }
    }
    
    HAL_FLASH_Lock();
    return 0;
}
```

**Why this complexity?**
- STM32 flash requires word-aligned writes (32-bit chunks)
- Last chunk might not be word-aligned (e.g., 1021 bytes)
- We pad remaining bytes with `0xFF` (erased flash value)

### Bank Erasing: Sector-by-Sector

Erasing an entire bank (256KB) requires erasing multiple sectors:

```c
int ota_erase_bank(uint32_t bank_address) {
    printf("Erasing bank at 0x%08lX...\r\n", bank_address);
    
    HAL_FLASH_Unlock();
    
    // Determine which sectors to erase based on address
    uint32_t start_sector, num_sectors;
    
    if (bank_address == BANK_A_ADDRESS) {
        start_sector = FLASH_SECTOR_4;  // Bank A: Sectors 4-7
        num_sectors = 4;
    } else if (bank_address == BANK_B_ADDRESS) {
        start_sector = FLASH_SECTOR_8;  // Bank B: Sectors 8-11
        num_sectors = 4;
    } else {
        HAL_FLASH_Lock();
        return -1;  // Invalid bank address
    }
    
    // Erase each sector
    for (uint32_t i = 0; i < num_sectors; i++) {
        FLASH_EraseInitTypeDef erase_config;
        erase_config.TypeErase = FLASH_TYPEERASE_SECTORS;
        erase_config.Sector = start_sector + i;
        erase_config.NbSectors = 1;
        erase_config.VoltageRange = FLASH_VOLTAGE_RANGE_3;
        
        uint32_t sector_error = 0;
        HAL_StatusTypeDef status = HAL_FLASHEx_Erase(&erase_config, &sector_error);
        
        if (status != HAL_OK) {
            printf("ERROR: Failed to erase sector %lu\r\n", start_sector + i);
            HAL_FLASH_Lock();
            return -1;
        }
        
        printf("  Sector %lu erased\r\n", start_sector + i);
    }
    
    HAL_FLASH_Lock();
    printf("Bank erase complete!\r\n");
    return 0;
}
```

**Sector layout for STM32F429:**

```
Bank A (0x08010000 - 0x08050000):
  Sector 4: 64KB
  Sector 5: 128KB
  Sector 6: 128KB  (we only use part of this)
  
Bank B (0x08050000 - 0x08090000):
  Sector 7: (remainder from above)
  Sector 8: 128KB
  Sector 9: 128KB
```

---

## Layer 2: UART Transport - Receiving Packets

The UART layer's job is simple: **receive bytes and assemble them into packets**.

### Blocking Receive with Timeout

```c
static int uart_receive_bytes(uint8_t *buffer, uint16_t size, uint32_t timeout_ms) {
    HAL_StatusTypeDef status = HAL_UART_Receive(&huart1, buffer, size, timeout_ms);
    
    if (status == HAL_OK) {
        return 0;  // Success
    } else if (status == HAL_TIMEOUT) {
        return -1;  // Timeout
    } else {
        return -1;  // Other error
    }
}
```

**Why blocking?**
- Simpler than interrupts for learning
- UART is slow (115200 baud ≈ 11KB/s), so blocking is acceptable
- For production, you'd use DMA + interrupts

### Packet Type Detection

Before reading a full packet, we peek at its type:

```c
static int uart_peek_packet_type(uint8_t *packet_type) {
    uint8_t header[5];  // magic (4) + type (1)
    
    if (uart_receive_bytes(header, 5, 5000) != 0) {
        return -1;  // Timeout
    }
    
    uint32_t magic = *((uint32_t*)header);
    *packet_type = header[4];
    
    // Validate magic
    if (magic != OTA_MAGIC_START && magic != OTA_MAGIC_DATA) {
        printf("ERROR: Invalid magic: 0x%08lX\r\n", magic);
        return -1;
    }
    
    return 0;
}
```

### Main Receive Loop

```c
void ota_uart_receive_loop(ota_context_t *ctx) {
    printf("Waiting for OTA packets...\r\n");
    
    while (1) {
        uint8_t packet_type;
        
        // Wait for next packet
        if (uart_peek_packet_type(&packet_type) != 0) {
            continue;  // Timeout or error, keep waiting
        }
        
        printf("Received packet type: 0x%02X\r\n", packet_type);
        
        switch (packet_type) {
            case OTA_PKT_START: {
                ota_start_packet_t pkt;
                if (uart_receive_bytes((uint8_t*)&pkt, sizeof(pkt), 5000) == 0) {
                    ota_process_start_packet(ctx, &pkt);
                }
                break;
            }
            
            case OTA_PKT_DATA: {
                ota_data_packet_t pkt;
                if (uart_receive_bytes((uint8_t*)&pkt, sizeof(pkt), 10000) == 0) {
                    ota_process_data_packet(ctx, &pkt);
                }
                break;
            }
            
            case OTA_PKT_END: {
                ota_end_packet_t pkt;
                if (uart_receive_bytes((uint8_t*)&pkt, sizeof(pkt), 5000) == 0) {
                    ota_process_end_packet(ctx, &pkt);
                    
                    if (ctx->state == OTA_STATE_COMPLETE) {
                        printf("OTA complete! Exiting receive loop.\r\n");
                        return;  // Exit after success
                    }
                }
                break;
            }
            
            case OTA_PKT_ABORT:
                printf("Received ABORT - resetting OTA\r\n");
                ota_init(ctx);
                break;
                
            default:
                printf("Unknown packet type: 0x%02X\r\n", packet_type);
                break;
        }
    }
}
```

**Design notes:**
- Loop runs until `OTA_STATE_COMPLETE` or ABORT
- Each packet type has different timeout (DATA is longer because packets are bigger)
- Errors don't crash the loop - we keep waiting for valid packets

---

## Testing Without Real UART: The Simulation

Before implementing real UART communication, we can test the entire OTA logic with a simulation:

```c
void test_ota_simulation(void) {
    printf("\r\n========================================\r\n");
    printf("    OTA SIMULATION TEST\r\n");
    printf("========================================\r\n");
    
    // Create fake firmware (5KB test data)
    #define TEST_FIRMWARE_SIZE 5120
    uint8_t *test_firmware = (uint8_t*)malloc(TEST_FIRMWARE_SIZE);
    
    if (test_firmware == NULL) {
        printf("ERROR: Failed to allocate test firmware\r\n");
        return;
    }
    
    // Fill with pattern
    for (int i = 0; i < TEST_FIRMWARE_SIZE; i++) {
        test_firmware[i] = (uint8_t)(i & 0xFF);
    }
    
    uint32_t firmware_crc = calculate_crc32(test_firmware, TEST_FIRMWARE_SIZE);
    printf("Test firmware CRC32: 0x%08lX\r\n", firmware_crc);
    
    // Initialize OTA
    ota_context_t ota_ctx;
    ota_init(&ota_ctx);
    
    // Simulate START packet
    uint32_t total_chunks = (TEST_FIRMWARE_SIZE + OTA_CHUNK_SIZE - 1) / OTA_CHUNK_SIZE;
    
    ota_start_packet_t start_pkt = {
        .magic = OTA_MAGIC_START,
        .packet_type = OTA_PKT_START,
        .firmware_size = TEST_FIRMWARE_SIZE,
        .firmware_version = 0x00020000,  // v2.0.0
        .firmware_crc32 = firmware_crc,
        .total_chunks = total_chunks,
        .target_bank = BANK_B
    };
    
    ota_process_start_packet(&ota_ctx, &start_pkt);
    
    if (ota_ctx.state != OTA_STATE_RECEIVING_DATA) {
        printf("ERROR: START failed\r\n");
        free(test_firmware);
        return;
    }
    
    // Simulate DATA packets
    for (uint32_t chunk_num = 0; chunk_num < total_chunks; chunk_num++) {
        ota_data_packet_t data_pkt;
        
        data_pkt.magic = OTA_MAGIC_DATA;
        data_pkt.packet_type = OTA_PKT_DATA;
        data_pkt.chunk_number = chunk_num;
        
        uint32_t offset = chunk_num * OTA_CHUNK_SIZE;
        uint32_t remaining = TEST_FIRMWARE_SIZE - offset;
        data_pkt.chunk_size = (remaining > OTA_CHUNK_SIZE) ? OTA_CHUNK_SIZE : remaining;
        
        memcpy(data_pkt.data, test_firmware + offset, data_pkt.chunk_size);
        data_pkt.chunk_crc32 = calculate_crc32(data_pkt.data, data_pkt.chunk_size);
        
        ota_process_data_packet(&ota_ctx, &data_pkt);
        
        if (ota_ctx.state == OTA_STATE_ERROR) {
            printf("ERROR: DATA packet %lu failed\r\n", chunk_num);
            free(test_firmware);
            return;
        }
    }
    
    // Simulate END packet
    ota_end_packet_t end_pkt = {
        .magic = OTA_MAGIC_START,
        .packet_type = OTA_PKT_END
    };
    
    ota_process_end_packet(&ota_ctx, &end_pkt);
    
    if (ota_ctx.state == OTA_STATE_COMPLETE) {
        printf("\r\n✓ OTA SIMULATION TEST COMPLETE!\r\n");
    } else {
        printf("\r\nERROR: OTA failed (state: %d)\r\n", ota_ctx.state);
    }
    
    free(test_firmware);
}
```

**Why simulate first?**
- Test logic without dealing with UART timing issues
- Easy to debug (everything runs synchronously)
- Catch bugs in state machine before adding communication complexity
- Can test error cases by injecting bad data

---

## Key Design Decisions Summarized

### 1. **Stateful vs. Stateless**

We chose a stateful design (OTA context tracks everything). Alternative would be stateless (each packet handler is independent).

**Pros of stateful:**
- Can reject out-of-order packets
- Track progress easily
- Clearer error handling

**Cons:**
- Must maintain context across calls
- More memory usage (though minimal - ~40 bytes)

### 2. **Write Directly to Flash vs. Buffer in RAM**

We write directly to flash as chunks arrive. Alternative would be buffering entire firmware in RAM first.

**Why direct write wins:**
- RAM is limited (~256KB total, shared with OS/stack)
- Firmware can be larger than available RAM
- Flash writes are reliable on STM32

**Trade-off:**
- If OTA fails midway, target bank has partial firmware (but that's fine - we don't mark it VALID)

### 3. **Per-Chunk CRC vs. Only Final CRC**

We verify CRC on each chunk *and* on the final firmware.

**Why both?**
- Per-chunk: Catch errors early, efficient retransmission
- Final: Catch addressing errors, confirm integrity

**Cost:**
- Extra CRC calculations (but hardware CRC is fast)
- More complex protocol

### 4. **Blocking UART vs. Interrupt-Driven**

We used blocking UART with timeouts. Alternative would be interrupt-driven with ring buffers.

**Why blocking for learning:**
- Simpler code
- Easier to debug
- Good enough for ~10KB/s throughput

**For production:**
- Use DMA + interrupts for better performance
- Non-blocking allows other tasks to run

---

## What We Haven't Covered (Yet)

This implementation is functional but not production-ready. Missing pieces:

1. **Retransmission logic**: If a chunk fails, how does the host resend it?
2. **Timeout handling**: What if host stops sending mid-transfer?
3. **Progress persistence**: If device resets during OTA, can we resume?
4. **Rollback testing**: What if new firmware crashes on boot? (Phase 6!)
5. **Real UART host script**: Python script to send actual .bin files

---

## Testing Checklist

Before moving to real OTA, verify:

- [ ] START packet with invalid size is rejected
- [ ] START packet for running bank is rejected
- [ ] DATA packets arrive in order (0, 1, 2...)
- [ ] Out-of-order DATA packet is rejected
- [ ] Corrupted chunk (bad CRC) is rejected
- [ ] All chunks written to correct addresses
- [ ] Final firmware CRC matches
- [ ] Boot state updated only after complete success
- [ ] Simulation test passes
- [ ] Device can boot new firmware from Bank B

---

## Conclusion

We've built a robust OTA system with:
- **Layered architecture**: UART transport, OTA manager, application
- **Comprehensive validation**: Every step is checked
- **Stateful protocol**: Rejects out-of-order/invalid packets
- **Direct flash writing**: No RAM buffering needed
- **Dual verification**: Per-chunk + final firmware CRC

The code prioritizes **correctness over performance** and **clarity over brevity**. In production, you'd optimize (DMA, interrupts, compression), but for learning, this design teaches the essential concepts.

**Next steps:**
1. Test the simulation thoroughly
2. Implement Python host script (Phase 5.5)
3. Test real UART OTA
4. Add rollback safety (Phase 6)

The foundation is solid. Now we build on it.
