---
layout: post
title: "Bootloader with OTA Phase 4.1: Debugging the CRC Mismatch"
date: 2026-01-26 19:40:10
categories: Firmware
toc:
  beginning: true
  sidebar: left
---

In Phase 4, I implemented the boot state structure with CRC32 integrity checking. The code looked correct, the logic made sense, and everything compiled without warnings.

I wrote a simple test program to verify the boot state read/write functions:

```c
int main(void)
{
    // Test 1: Read boot state (should be invalid on first run)
    printf("\n--- Test 1: Reading boot state ---\r\n");
    boot_state_t state;
    int result = boot_state_read(&state);

    if (result == -1) {
        printf("Boot state: Invalid/Erased (expected on first run)\r\n");
    } else if (result == -2) {
        printf("Boot state: CRC mismatch - CORRUPTED!\r\n");
    } else {
        printf("Boot state: Valid\r\n");
        printf("  Magic: 0x%08lX\r\n", state.magic_number);
        printf("  Active Bank: %d\r\n", state.active_bank);
        printf("  Bank A Status: %d\r\n", state.bank_a_status);
        printf("  Bank B Status: %d\r\n", state.bank_b_status);
    }

    // Test 2: Write a new boot state
    printf("\n--- Test 2: Writing new boot state ---\r\n");
    boot_state_t new_state = {
        .magic_number = BOOT_STATE_MAGIC,
        .bank_a_status = BANK_STATUS_VALID,
        .bank_b_status = BANK_STATUS_INVALID,
        .active_bank = BANK_A,
        .crc32 = 0  // Will be calculated
    };

    printf("Erasing boot state sector...\r\n");
    if (boot_state_erase() != 0) {
        printf("ERROR: Erase failed!\r\n");
        while(1);
    }
    printf("Erase successful!\r\n");

    printf("Writing boot state...\r\n");
    if (boot_state_write(&new_state) != 0) {
        printf("ERROR: Write failed!\r\n");
        while(1);
    }
    printf("Write successful!\r\n");

    // Test 3: Read it back
    printf("\n--- Test 3: Reading back ---\r\n");
    result = boot_state_read(&state);

    if (result == 0) {
        printf("Boot state: Valid!\r\n");
        printf("  Magic: 0x%08lX\r\n", state.magic_number);
        printf("  Active Bank: %d\r\n", state.active_bank);
        printf("  Bank A Status: %d\r\n", state.bank_a_status);
        printf("  Bank B Status: %d\r\n", state.bank_b_status);
        printf("  CRC32: 0x%08lX\r\n", state.crc32);
    } else {
        printf("ERROR: Read failed with code %d\r\n", result);
    }

    // Test 4: Get bank address
    printf("\n--- Test 4: Bank addresses ---\r\n");
    uint32_t addr_a = boot_state_get_bank_address(BANK_A);
    uint32_t addr_b = boot_state_get_bank_address(BANK_B);
    uint32_t addr_invalid = boot_state_get_bank_address(BANK_INVALID);

    printf("Bank A address: 0x%08lX\r\n", addr_a);
    printf("Bank B address: 0x%08lX\r\n", addr_b);
    printf("Invalid bank address: 0x%08lX\r\n", addr_invalid);

    printf("\n========================================\r\n");
    printf("All tests complete!\r\n");
    printf("========================================\r\n");

    while (1) {
        HAL_GPIO_TogglePin(GPIOG, GPIO_PIN_13);
        HAL_Delay(1000);
    }
}
```

If there isn't any problem, the output should be:

```
--- Test 1: Reading boot state ---
Boot state:
Magic: 0x...
Active Bank: ...
Bank A Status: ...
Bank B Status: ...
--- Test 2: Writing new boot state ---
Erasing boot state sector...
Erase successful!
Writing boot state...
Write successful!
--- Test 3: Reading back ---
Boot state: Valid!
Magic: ...
Active Bank: ...
Bank A Status: ...
Bank B Status: ...
CRC32: 0x...
--- Test 4: Bank addresses ---
Bank A address: 0x08010000
Bank B address: 0x08050000
Invalid bank address: 0x00000000
========================================
All tests complete!
========================================
```

However, my actual output was:

```
--- Test 1: Reading boot state ---
Boot state: CRC mismatch - CORRUPTED!
--- Test 2: Writing new boot state ---
Erasing boot state sector...
Erase successful!
Writing boot state...
Write successful!
--- Test 3: Reading back ---
ERROR: Read failed with code -2
--- Test 4: Bank addresses ---
Bank A address: 0x08010000
Bank B address: 0x08050000
Invalid bank address: 0x00000000
========================================
All tests complete!
========================================
```

The write says it succeeded, but reading back immediately fails with a CRC error. We also got `ERROR: Read failed with code -2`, meaning `boot_state_read` returned -2 for some reason.

First, let's read the `boot_state_read` code carefully:

```c
int boot_state_read(boot_state_t *state) {
    // Step 1: Read from flash
    memcpy(state, (void*)BOOT_STATE_ADDRESS, sizeof(boot_state_t));
    // Step 2: Check magic number
    if (state->magic_number != BOOT_STATE_MAGIC) {
        return -1;
    }
    // Step 3: Calculate what the CRC should be
    uint32_t saved_crc = state->crc32;
    state->crc32 = 0;
    uint32_t calculated_crc = calculate_crc32(state, sizeof(boot_state_t));

    printf("  calculated CRC32: 0x%08lX\r\n", calculated_crc);
    state->crc32 = saved_crc;

    if (calculated_crc != saved_crc) {
        printf("  CRC MISMATCH!\r\n");
        return -2;
    }

    return 0;
```

Okay, it's because `calculated_crc` doesn't match `saved_crc`. In other words, the CRC value stored in flash memory is not equal to the CRC value it is supposed to be.

But we still didn't pinpoint the cause, because CRC32 value is calculated from the entire values in `boot_state`. `boot_state` consists of `magic_number`, `bank_a_status`, `bank_b_status`, `active_bank`, and `crc32`. We do not know if one (or more) of these are corrupted, if flash operation didn't work, if we wrote in the wrong memory address, etc.

{% include figure.liquid
   loading="eager"
   path="/assets/post-attachments/2026-01-26/CRC32_mismatch.png"
   class="img-fluid rounded z-depth-1" width="500px"
   %}

Let's debug it systematically. Add debug output for every attribute of `boot_state`.

```c
int boot_state_read(boot_state_t *state) {
    // Step 1: Read from flash
    memcpy(state, (void*)BOOT_STATE_ADDRESS, sizeof(boot_state_t));

    printf("DEBUG: Raw data from flash:\r\n");
    printf("  magic_number: 0x%08lX\r\n", state->magic_number);
    printf("  bank_a_status: 0x%02X\r\n", state->bank_a_status);
    printf("  bank_b_status: 0x%02X\r\n", state->bank_b_status);
    printf("  active_bank: 0x%02X\r\n", state->active_bank);
    printf("  stored CRC32: 0x%08lX\r\n", state->crc32);

    // Step 2: Check magic number
    if (state->magic_number != BOOT_STATE_MAGIC) {
        return -1;
    }

    // Step 3: Calculate what the CRC should be
    uint32_t saved_crc = state->crc32;
    state->crc32 = 0;
    uint32_t calculated_crc = calculate_crc32(state, sizeof(boot_state_t));

    printf("  calculated CRC32: 0x%08lX\r\n", calculated_crc);

    state->crc32 = saved_crc;

    if (calculated_crc != saved_crc) {
        printf("  CRC MISMATCH!\r\n");
        return -2;
    }

    return 0;
}
```

Also add debug output to `boot_state_write()`:

```c
int boot_state_write(const boot_state_t *state) {
    boot_state_t state_copy;
    memcpy(&state_copy, state, sizeof(boot_state_t));

    // Calculate CRC32
    state_copy.crc32 = 0;
    state_copy.crc32 = calculate_crc32(&state_copy, sizeof(boot_state_t));

    printf("DEBUG: Writing to flash:\r\n");
    printf("  magic_number: 0x%08lX\r\n", state_copy.magic_number);
    printf("  bank_a_status: 0x%02X\r\n", state_copy.bank_a_status);
    printf("  bank_b_status: 0x%02X\r\n", state_copy.bank_b_status);
    printf("  active_bank: 0x%02X\r\n", state_copy.active_bank);
    printf("  CRC32: 0x%08lX\r\n", state_copy.crc32);

    // Verify CRC
    uint32_t saved_crc = state->crc32;
    state->crc32 = 0;
    uint32_t calculated_crc = calculate_crc32(state, sizeof(boot_state_t));

    printf("  calculated CRC32: 0x%08lX\r\n", calculated_crc);
    state->crc32 = saved_crc;

    if (calculated_crc != saved_crc) {
        printf("  CRC MISMATCH!\r\n");
        return -2;
    }

    return 0;
}
```

Here's what the debug output revealed:

```
--- Test 1: Reading boot state ---
DEBUG: Raw data from flash:
  magic_number: 0xDEADBEEF
  bank_a_status: 0x01
  bank_b_status: 0x00
  active_bank: 0x00
  stored CRC32: 0xFFFFFF9D
  calculated CRC32: 0xA43B5D9D
Boot state: CRC mismatch - CORRUPTED!
--- Test 2: Writing new boot state ---
Erasing boot state sector...
Erase successful!
Writing boot state...
DEBUG: Writing to flash:
  magic_number: 0xDEADBEEF
  bank_a_status: 0x01
  bank_b_status: 0x00
  active_bank: 0x00
  CRC32: 0xA43B5D9D
Write successful!
--- Test 3: Reading back ---
DEBUG: Raw data from flash:
  magic_number: 0xDEADBEEF
  bank_a_status: 0x01
  bank_b_status: 0x00
  active_bank: 0x00
  stored CRC32: 0xFFFFFF9D
  calculated CRC32: 0xA43B5D9D
ERROR: Read failed with code -2
--- Test 4: Bank addresses ---
Bank A address: 0x08010000
Bank B address: 0x08050000
Invalid bank address: 0x00000000
========================================
All tests complete!
========================================
```

Now we found the problem. We calculated CRC during write: `0xA43B5D9D`. Calculated CRC during read is also `0xA43B5D9D`. But CRC value stored in flash is `0xFFFFFF9D`!

```
0xFFFFFFFF -> Initial empty state
0xA43B5D9D -> Calculated value
0xFFFFFF9D -> What is stored in flash
________9D -> Only the last byte is correct!
```

This means it's not a CRC calculation problem, but a flash write problem.

## Finding the Root Cause

Let's look at the original `boot_state` structure:

```c
typedef struct {
    uint32_t magic_number;       // 4 bytes
    bank_status_t bank_a_status; // 1 byte (enum)
    bank_status_t bank_b_status; // 1 byte (enum)
    active_bank_t active_bank;   // 1 byte (enum)
    uint32_t crc32;              // 4 bytes
} __attribute__((packed)) boot_state_t;
```

Total size is 4 + 1 + 1 + 4 = 11 bytes.

Since the problem is in flash write, let's look at the `boot_state_write` code:

```c
uint32_t *data = (uint32_t*)&state_copy;
uint32_t address = BOOT_STATE_ADDRESS;

for (int i = 0; i < sizeof(boot_state_t) / 4; i++) {
    HAL_FLASH_Program(FLASH_TYPEPROGRAM_WORD, address, data[i]);
    address += 4;
}
```

`sizeof(boot_state_t)` is 11 bytes.
But if `11 / 4`, it's 2 (integer division act as floor function).

Therefore, we iterate twice, writing only 8 bytes instead of all 11 bytes. The last 3 bytes never get written.

Now every puzzle falls into place:

```
Memory layout of boot_state_t (11 bytes):
┌────────────┬───┬───┬───┬─────────────┐
│  magic     │ a │ b │ c │   crc32     │
│  (4 bytes) │ 1 │ 1 │ 1 │  (4 bytes)  │
└────────────┴───┴───┴───┴─────────────┘
 Word 0       Word 1        Word 2
 (written)    (written)   (NOT written)
              └─ Only first byte of Word 2 gets written
```

## Two Solutions

First approach handles partial words:

```c
    // Write full words first
    int num_words = sizeof(boot_state_t) / 4;
    for (int i = 0; i < num_words; i++) {
        uint32_t word = *((uint32_t*)(data + i * 4));
        HAL_FLASH_Program(FLASH_TYPEPROGRAM_WORD, address, word);
        address += 4;
    }

    // Write remaining bytes
    int remaining_bytes = sizeof(boot_state_t) % 4;
    if (remaining_bytes > 0) {
        // Program remaining bytes as a word (pad with 0xFF)
        uint32_t last_word = 0xFFFFFFFF;  // Erased flash value
        memcpy(&last_word, data + num_words * 4, remaining_bytes);

        HAL_FLASH_Program(FLASH_TYPEPROGRAM_WORD, address, last_word);
```

This is obviously the most intuitive way to fix the problem, but what if we don't want the extra code below?

The second approach is to redesign the structure to be word-aligned.

Previously, `boot_state_t` struct was defined in 11 bytes:

```c
typedef enum {
    BANK_A = 0x00,
    BANK_B = 0x01,
    BANK_INVALID = 0xFF
} active_bank_t;

typedef enum {
    BANK_STATUS_INVALID = 0x00,
    BANK_STATUS_VALID = 0x01,
    BANK_STATUS_TESTING = 0x02
} bank_status_t;

typedef struct {
    uint32_t magic_number;
    bank_status_t bank_a_status;
    bank_status_t bank_b_status;
    active_bank_t active_bank;
    uint32_t crc32;
} __attribute__((packed)) boot_state_t;
```

`active_bank_t` and `bank_status_t` were both enum struct, each 1 byte. But if we change `active_bank` and bank status type into `uint32_t` (4 byte):

```c
typedef struct {
    uint32_t magic_number;           // 4 bytes
    uint32_t bank_a_status;          // 4 bytes (was 1 byte)
    uint32_t bank_b_status;          // 4 bytes (was 1 byte)
    uint32_t active_bank;            // 4 bytes (was 1 byte)
    uint32_t crc32;                  // 4 bytes
} boot_state_t;  // Total: 20 bytes = 5 words, perfectly aligned!
```

Then we do not have to worry about extra remaining bytes. We can leave `boot_state_write` as it was, and it will fix the CRC mismatch issue.

## Small Discussion

Claude argued the second approach is better in that it doesn't need special handling, it makes code simpler, and it's less error-prone. I agree with it at some point: We use 9 extra bytes in flash to make `boot_state` word-aligned, but for a structure stored once in a 128KB sector, this is completely negligible.
However, I don't think the first approach is a bad idea; it also works, but it makes a code just a bit more complicated. If I choose the second approach, and if this is a collaborative project, programmers would need to establish an explicit design rule: all structures stored in flash memory must be word-aligned.
