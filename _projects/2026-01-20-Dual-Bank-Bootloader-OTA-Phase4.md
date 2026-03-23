---
layout: page
title: "Bootloader with OTA Phase 4: Implementing Persistent Boot State"
date: 2026-01-20 14:48:37
category: Dual-Bank Bootloader with OTA Update
toc:
  beginning: true
  sidebar: left
---

In Phase 3, we built a dual-bank system where Bank A and Bank B can each hold a complete firmware image. **But when the device powers on, how does the bootloader know which bank to boot from?** That's where the "boot state" comes in. We store the boot state in persistent storage so that it can be retrieved across power cycles.

To give its definition, the **boot state** is a small data structure stored in flash memory that tells the bootloader about 1) which bank is currently active 2) which bank contains valid firmware 3) which bank is being tested after an update.

Phase 4 focuses on designing this boot state structure and implementing the read/write/erase functions to manage it in flash memory. We'll also explore CRC32 integrity checks and how to handle structure alignment constraints.

{% include figure.liquid
   loading="eager"
   path="/assets/post-attachments/2026-01-20/boot_state_structure.png"
   class="img-fluid rounded z-depth-1 figure-lines"
   %}

## Designing `boot_state` Structure

Here is the basic structure of `boot_state`:

```c
#ifndef BOOT_STATE_H
#define BOOT_STATE_H

#include <stdint.h>

// Flash addresses
#define BOOT_STATE_ADDRESS  0x08090000
#define BANK_A_ADDRESS      0x08010000
#define BANK_B_ADDRESS      0x08050000

// Magic number to identify valid boot state
#define BOOT_STATE_MAGIC    0xDEADBEEF

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

// Function prototypes
int boot_state_read(boot_state_t *state);
int boot_state_write(const boot_state_t *state);
uint32_t boot_state_get_bank_address(active_bank_t bank);

#endif // BOOT_STATE_H
```

Key design decisions:

1. **Magic number (`0xDEADBEEF`)**: Acts as a signature to detect valid boot state vs. erased/corrupted flash
2. **Bank status enum**: Tracks whether each bank is VALID, INVALID, or TESTING (for rollback after OTA)
3. **CRC32 field**: Integrity check to detect flash corruption or incomplete writes
4. **`__attribute__((packed))`**: Prevents compiler from adding padding, ensuring consistent binary layout

We are just about to start implementing code for `boot_state_read`, `boot_state_write`, and `boot_state_get_bank_address` yet. But before jumping into implementation, let's recall the way Claude led conversation: it would ask me questions to think over topics before giving out the answers.

#### Question 1: What Should `boot_state_read()` Return?

The boot state contains information needed to boot the correct bank. What should this function return? Return the actual state structure? Or should it return success/failure and fill in a pointer? What error codes might you need?

> My answer: Yes, it should return success/failure and fill in a pointer. Returning the actual state wastes memory; instead, we can always access the target value (in which this case is boot_state struct) through a pointer.

#### Q1. Claude's Feedback

You're exactly right! Returning the actual struct would be wasteful and inflexible. Here's why returning success/failure with a pointer parameter is better:

**1. Memory efficiency**: The caller already has storage for the struct (either on the stack or as a global). Why duplicate it on the return path?

**2. Error handling**: If reading fails (corrupted magic number, CRC mismatch, flash read error), what would you return? A "garbage" struct? By returning an integer status code, you can clearly distinguish between success and various failure modes:

```c
#define BOOT_STATE_OK           0
#define BOOT_STATE_ERR_MAGIC   -1  // Invalid magic number
#define BOOT_STATE_ERR_CRC     -2  // CRC verification failed
#define BOOT_STATE_ERR_FLASH   -3  // Flash read error
```

**3. Flexibility**: The caller can decide where to store the result (stack, heap, global), and the function just fills it in. This is the standard C pattern for "output parameters."

```c
boot_state_t state;
int result = boot_state_read(&state);

if (result == BOOT_STATE_OK) {
    // Use state.active_bank, state.bank_a_status, etc.
} else if (result == BOOT_STATE_ERR_MAGIC) {
    // Initialize with defaults
} else {
    // Handle other errors
}
```

#### Question 2: What Should `boot_state_get_bank_address()` Return for Invalid Banks?

This function converts a bank enum to its flash address:

- `BANK_A` → `0x08010000`
- `BANK_B` → `0x08050000`

But what about `BANK_INVALID`? Should it return `0xFF`, `0x00` , or something else?

#### Q2. Claude's Feedback

Returning 0xFF or 0x00 is dangerous! Why? If you try to jump to address 0x00 or 0xFF - your microcontroller will crash or go to an invalid memory location. So the better approach would be to return 0 (NULL) to indicate "no valid address".

#### Question 3. What Steps Must `boot_state_write()` Perform?

Writing to flash isn't as simple as `memcpy()`. Think about the flash erase/write process from Phase 1. List the steps in order (Erase the sector - Calculate CRC32 of the state before writing - Write the state structure to flash). What could go wrong at each step?

> My answer: Well, Claude already gave me the answer. Erase the sector - Calculate CRC32 of the state before writing - Write the state structure to flash. Isn't it the same?

#### Q3. Claude's Feedback

The steps are correct, but let's think about _why_ each step matters and what could go wrong:

**Step 1: Unlock flash**

- Flash is write-protected by default to prevent accidental corruption
- Must call `HAL_FLASH_Unlock()` before any write operation

**Step 2: Erase the sector**

- Remember: flash can only transition bits from 1→0, never 0→1 without erasing
- The boot state sector must be erased to 0xFFFFFFFF before writing new data
- If you skip this, the new data would be AND-ed with old data (corrupted state!)

**Step 3: Calculate CRC32**

- The CRC is calculated over the _entire struct except the CRC field itself_
- This protects against flash corruption, bit flips, or partial writes
- When reading back, we recalculate and compare—if they don't match, the state is invalid

**Step 4: Write to flash**

- Must write in aligned chunks (remember Phase 4's alignment requirements!)
- For STM32F4, you typically write 32-bit words or 64-bit double-words
- The `__attribute__((packed))` ensures no padding, so sizeof(boot_state_t) is predictable

**Step 5: Lock flash**

- Always re-lock flash after writing to restore write protection
- Even if an error occurs, you should lock in a `finally`-style cleanup

**What happens if power is lost during step 4?** The magic number or CRC will be invalid when you try to read it back on the next boot. The bootloader will detect this and initialize with safe defaults (try Bank A first). This is why the magic number and CRC are so important. They act as "canaries" that detect incomplete writes.

### Should Erase and Write Be Separate Functions?

Here's a critical question: Why should we separate a function to **erase** the sector itself from write? Why shouldn't we combine them into one function?

```c
// Option A: Combined
int boot_state_write(const boot_state_t *state);  // Erases internally

// Option B: Separate
int boot_state_erase(void);
int boot_state_write(const boot_state_t *state);  // Assumes already erased
```

It can be explained in **Single Responsibility Principle**.

`boot_state_erase()` does one thing, erasing the sector. `boot_state_write()` also does one thing, writing data (assumes sector is already erased). The **Single Responsibility Principle** is a core, essential programming principle. It makes code easier to test, debug, and reuse.

This also aligns with the advantages of Single Responsibility Principle. It makes error handling easier and improves overall safety. Plus, it provides greater flexibility.

1.  **Error handling:** When each function has its own responsibility, it’s clear where and what went wrong. When multiple responsibilities are mixed in one function, identifying the source of failure becomes much harder.
    > 2. **Safety:** Erasing data can be a destructive operation. By making the process explicit, you reduce the risk of accidental data loss.
    > 3. **Flexibility:** What if you need to erase a sector without writing immediately, or write multiple times without erasing each time? Separating operations allows these cases to be handled more elegantly.

## Implementation: The Three Core Functions

Now let's implement the API we've designed. I'll show the key parts with explanations, focusing on the concepts rather than every line of code.

### `boot_state_read()`: Loading State from Flash

This function performs three critical checks:

1. It reads from flash, meaning it copies the memory in the target address to `boot_state_t` pointer
2. Checks magic number
3. Verifies CRC32 by comparing state's current CRC vs. state's genuine (newly calculated) CRC

```c
int boot_state_read(boot_state_t *state) {
    // Step 1: Read from flash
    memcpy(state, (void*)BOOT_STATE_ADDRESS, sizeof(boot_state_t));

    // Step 2: Check magic number
    if (state->magic_number != BOOT_STATE_MAGIC) {
        return -1;  // Invalid or erased
    }

    // Step 3: Verify CRC32
    uint32_t saved_crc = state->crc32;
    state->crc32 = 0;
    uint32_t calculated_crc = calculate_crc32(state, sizeof(boot_state_t));
    state->crc32 = saved_crc;  // Restore it

    if (calculated_crc != saved_crc) {
        return -2;  // Corrupted
    }

    return 0;  // Success!
}
```

In the code, why does it zero out the CRC field before calculating? It's because the CRC was calculated over a version of the struct with `crc32 = 0`. To verify, we must recalculate using the same method.

### `boot_state_erase()`: Pre-Step for `boot_state_write`

Before writing new boot state, we must erase the sector.

```c
int boot_state_erase(void) {
    // 1. Unlock flash for modification
    HAL_FLASH_Unlock();

    // 2. Configure erase operation
    FLASH_EraseInitTypeDef erase_config;
    erase_config.TypeErase = FLASH_TYPEERASE_SECTORS;
    erase_config.Sector = FLASH_SECTOR_8;  // Boot state sector at 0x08090000
    erase_config.NbSectors = 1;
    erase_config.VoltageRange = FLASH_VOLTAGE_RANGE_3;  // 2.7V to 3.6V

    uint32_t sector_error = 0;
    HAL_StatusTypeDef status = HAL_FLASHEx_Erase(&erase_config, &sector_error);

    // 3. Always lock flash before returning
    HAL_FLASH_Lock();

    return (status == HAL_OK) ? 0 : -1;
}
```

First, we lock flash even if erase fails. The same principle was applied in Phase 3, as this prevents leaving flash in an unlocked (vulnerable) state.

Second, I chose `FLASH_SECTOR_8` for the boot state in STM32F429 flash memory. Flash memory is divided into sectors, and address `0x08090000` (which is the start address of where the boot state sits in) falls in Sector 8. See the reference manual (RM0090) for your specific MCU's sector layout.

### `boot_state_write()`: Saving State to Flash

This is the most complex function. We write word-by-word to respect flash alignment:

```c
int boot_state_write(const boot_state_t *state) {
    // 1. Make a copy so we can modify it (calculate CRC)
    boot_state_t state_copy;
    memcpy(&state_copy, state, sizeof(boot_state_t));

    // 2. Calculate and store CRC32
    state_copy.crc32 = 0;
    state_copy.crc32 = calculate_crc32(&state_copy, sizeof(boot_state_t));

    // 3. Unlock flash
    HAL_FLASH_Unlock();

    // 4. Write word by word (32-bit chunks)
    uint32_t *data = (uint32_t*)&state_copy;
    uint32_t address = BOOT_STATE_ADDRESS;

    for (int i = 0; i < sizeof(boot_state_t) / 4; i++) {
        HAL_StatusTypeDef status = HAL_FLASH_Program(
            FLASH_TYPEPROGRAM_WORD,
            address,
            data[i]
        );

        if (status != HAL_OK) {
            HAL_FLASH_Lock();
            return -1;  // Write failed
        }

        address += 4;  // Move to next word (4 bytes)
    }

    // 5. Lock flash
    HAL_FLASH_Lock();

    return 0;  // Success
}
```

There are two things to note here.

First, it writes word by word (32-bit chunks). This is because STM32 flash has alignment requirements, or the HAL expects 32-bit (word) or 64-bit (double-word) writes. Writing byte-by-byte would fail or corrupt data.

Second, why do we make a copy of boot state here? We need to calculate the CRC and store it in the struct before writing. We don't want to modify the caller's original struct!

---

## Implementing CRC32

There's still one thing left to implement: calculating CRC32 for boot state verification. Good news is that STM32F429 has a hardware CRC peripheral, which is much faster than software CRC. But before running the code, you need to set up in STM32CubeIDE:

1. Open your `.ioc` file
2. Go to **Computing → CRC**
3. Check "Activated"
4. Save and regenerate code

Implementation:

```c
#include "boot_state.h"
#include "main.h"
#include <string.h>

extern CRC_HandleTypeDef hcrc;  // You'll need to initialize this in main.c

uint32_t calculate_crc32(const void *data, size_t length) {
    // Reset CRC peripheral
    __HAL_CRC_DR_RESET(&hcrc);

    // Calculate CRC
    return HAL_CRC_Calculate(&hcrc, (uint32_t*)data, length / 4);
}
```

Why do we divide `length` by 4 in the CRC calculation?

- **Parameter 2:** Pointer to data (as `uint32_t*`)
- **Parameter 3:** Number of **words** (not bytes!)

Since `sizeof(boot_state_t)` gives bytes, we divide by 4 to convert to words.

## Integrating Boot State into the Bootloader

Now let's use boot state in our main bootloader logic. Here's the flow:

1. **Read boot state** from flash
2. **Validate** the state (check magic number and CRC)
3. **Determine which bank** to boot based on state
4. **Fallback logic** if selected bank is invalid
5. **Jump** to the chosen application

Here's a simplified version of `main()` showing the key sections:

```c
int main(void)
{
    HAL_Init();
    SystemClock_Config();
    MX_GPIO_Init();
    MX_USART1_UART_Init();
    MX_CRC_Init();

    printf("\r\n========================================\r\n");
    printf("    BOOTLOADER v1.0\r\n");
    printf("========================================\r\n");

    // Blink LED to show bootloader is running
    printf("Bootloader running... (LED blinks 3 times)\r\n");
    for (int i = 0; i < 3; i++) {
        HAL_GPIO_WritePin(GPIOG, GPIO_PIN_13, GPIO_PIN_SET);
        HAL_Delay(200);
        HAL_GPIO_WritePin(GPIOG, GPIO_PIN_13, GPIO_PIN_RESET);
        HAL_Delay(200);
    }

    // Read boot state
    printf("\r\nReading boot state...\r\n");
    boot_state_t state;
    int result = boot_state_read(&state);

    uint32_t boot_address = 0;

    if (result == 0) {
        // Valid boot state found
        printf("Boot state valid!\r\n");
        printf("  Active bank: %s\r\n",
               state.active_bank == BANK_A ? "Bank A" : "Bank B");
        printf("  Bank A status: %s\r\n",
               state.bank_a_status == BANK_STATUS_VALID ? "VALID" : "INVALID");
        printf("  Bank B status: %s\r\n",
               state.bank_b_status == BANK_STATUS_VALID ? "VALID" : "INVALID");

        // Check if selected bank is valid
        if (state.active_bank == BANK_A &&
            state.bank_a_status == BANK_STATUS_VALID) {
            boot_address = BANK_A_ADDRESS;
            printf("Booting from Bank A\r\n");
        }
        else if (state.active_bank == BANK_B &&
                 state.bank_b_status == BANK_STATUS_VALID) {
            boot_address = BANK_B_ADDRESS;
            printf("Booting from Bank B\r\n");
        }
        else {
            printf("Selected bank is invalid! Trying fallback...\r\n");
        }
    }
    else {
        printf("Boot state invalid (code %d). Using defaults.\r\n", result);
    }

    // Fallback logic if no valid bank selected yet
    if (boot_address == 0) {
        printf("Attempting fallback boot sequence:\r\n");

        // Try Bank A first
        if (result == 0 && state.bank_a_status == BANK_STATUS_VALID) {
            boot_address = BANK_A_ADDRESS;
            printf("  Trying Bank A (fallback)\r\n");
        }
        // Then try Bank B
        else if (result == 0 && state.bank_b_status == BANK_STATUS_VALID) {
            boot_address = BANK_B_ADDRESS;
            printf("  Trying Bank B (fallback)\r\n");
        }
        // Default to Bank A even if state is invalid
        else {
            boot_address = BANK_A_ADDRESS;
            printf("  Defaulting to Bank A\r\n");
        }
    }

    printf("\r\nJumping to application at 0x%08lX...\r\n", boot_address);
    HAL_Delay(500);

    jump_to_application(boot_address);

    // If we reach here, jump failed
    printf("\r\nERROR: Failed to jump to application!\r\n");
    printf("Staying in bootloader mode.\r\n");

    while (1) {
        HAL_GPIO_TogglePin(GPIOG, GPIO_PIN_13);
        HAL_Delay(500);
    }
}
```

To summarize the overall flow:

1. If boot state is invalid, we default to Bank A (safe choice)
2. If selected bank is invalid, we try the other bank before giving up
3. Set up visual feedback for debugging, e.g. UART messages or LED blinking

## Testing

### Test 1: Boot Bank A (Normal Case)

**Expected behavior:**

- Bootloader reads boot state
- Validates it (magic number + CRC pass)
- Boots Bank A at `0x08010000`

And boot state should say "Boot Bank A, Bank A is valid"

### Test 2: Force Boot Bank B, Even Though It's Empty

This test is performed to make the bootloader try to boot Bank B, even though it's empty. Add this temporary code before the boot logic:

```c
// TEMPORARY TEST: Pretend Bank B is valid and active
boot_state_t test_state = {
    .magic_number = BOOT_STATE_MAGIC,
    .bank_a_status = BANK_STATUS_VALID,
    .bank_b_status = BANK_STATUS_VALID,  // Lie: Bank B is "valid"
    .active_bank = BANK_B,
    .crc32 = 0  // Will be calculated in boot_state_write()
};
boot_state_erase();
boot_state_write(&test_state);
```

**Expected behavior:**

- Bootloader reads the fake boot state
- Tries to boot Bank B at `0x08050000`
- Detects invalid stack pointer (all `0xFF` in empty flash)
- Refuses to jump

**Actual output:**

```
Booting from Bank B
Jumping to application at 0x08050000...
Preparing to jump to application at 0x08050000...
  App Stack Pointer: 0xFFFFFFFF
  App Entry Point:   0xFFFFFFFF
ERROR: Invalid stack pointer! Application may not be valid.
ERROR: Failed to jump to application!
Staying in bootloader mode.
```

**Result:** Perfect! The bootloader correctly read the boot state, attempted to boot from Bank B, but detected invalid application because Bank B flash sector was empty (erased). In the end, it refused to jump.

This validates our safety checks from Phase 2's `jump_to_application()` function.

## Key Takeaway

One thing that really impressed me about working with Claude was its teaching approach. It would identify important topics, ask questions and let me think through the problems. In this way, Claude was able to supplement details or correct my misconceptions. This is very like Socratic method, helping one to deepen knowledge and build critical thinking skills rather than giving all the answers upfront.

---

In Phase 5, we'll finally build the OTA protocol. It's the mechanism for actually downloading new firmware over UART and writing it to the inactive bank. The boot state we built here will be crucial for switching between banks after a successful update.
