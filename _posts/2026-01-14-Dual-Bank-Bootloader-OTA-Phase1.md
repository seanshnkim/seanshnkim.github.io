---
layout: post
title: "Bootloader with OTA Phase 1: Flash Operations"
date: 2026-01-14 07:18:44
categories: Firmware
---

## The Problem: Where Should the Bootloader Store State?

Here's the core question of Phase 1: **The bootloader needs to remember which firmware bank is active and whether the last boot was successful. Where should this information live?**

The requirements are clear:

- The data must **survive power cycles** (no battery-backed RAM)
- It needs to be **updated during the OTA process** (the bootloader writes it)
- Both the **bootloader and application** might need to read or modify it

RAM is volatile memory, which means the information stored inside will be gone as power is off. External EEPROM could work, but that adds hardware complexity. Thus, the answer is **internal flash memory**. It's non-volatile, already present on the chip, and can be programmed during runtime.

That's why Claude first allocated the STM32 flash memory layout before writing code:

```
Flash Memory Layout (2MB total in STM32F429I-DISC1):

0x08000000  ┌─────────────────────┐
            │   Bootloader        │  64KB (Sectors 0-3)
0x08010000  ├─────────────────────┤
            │   Bank A            │  192KB (Sectors 4-5)
            │   (Application)     │
0x08040000  ├─────────────────────┤
            │   Bank B            │  256KB (Sectors 6-7)
            │   (Application)     │
0x08080000  ├─────────────────────┤
            │Persistent Boot State│  128KB (Sector 8)
0x08100000  └─────────────────────┘
```

The STM32F429 has 2MB of internal flash memory organized into **sectors** of varying sizes. Different sectors have different sizes, and this matters when planning a memory layout.

For reference, details are in RM0090 Reference Manual - 3.4 Embedded flash memory in STM32F42xxx and STM32F43xxx (p.77/1757).

{% include figure.liquid
   loading="eager"
   path="/assets/post-attachments/2026-01-14/STM32F42xxx_Flash-Module.png"
   class="img-fluid rounded z-depth-1 figure-lines"
   %}<br>

Now, there are three separate projects to achieve:

1. **Bootloader** - Decides which bank to boot, handles rollback
2. **Application** - Actual firmware (will be duplicated in Bank A & B)
3. **OTA Updater** - Code within the application that downloads new firmware

To implement bootloader OTA update system, we need to store bootloader's persistent state somewhere and be able to update it. Literally, bootloader state needs to be restored from "booting (power reset)". But writing data to flash is quite different from just assigning values to variables or using pointers. That's why we're about to write a simple program that manipulates the STM32F429's internal flash memory for Phase 1.

## First Task: Read Flash

This is the code that simply **reads** from flash, no erase or write.

```c
/* USER CODE BEGIN 2 */

printf("\r\n=== STM32F429 Flash Operations Test ===\r\n\r\n");

// Let's read from Sector 11 (address 0x080E0000)
uint32_t test_address = 0x080E0000;

// Read the first 4 words (16 bytes) from this sector
printf("Reading from flash sector 11 (0x080E0000):\r\n");
for (int i = 0; i < 4; i++)
{
    uint32_t *ptr = (uint32_t *)(test_address + (i * 4));
    uint32_t value = *ptr;
    printf("  Address 0x%08lX: 0x%08lX\r\n", (uint32_t)ptr, value);
}

printf("\r\nFlash read complete!\r\n");

/* USER CODE END 2 */
```

Questions:

- What values do you see printed? Are they all `0xFFFFFFFF`? Or something else?
- Why are we using **pointer dereferencing** (`*ptr`) to read from flash? What does that line of code actually do at the hardware level?

### Q1. What values do you see printed?

**Expected output:**

- If the sector is **erased** (untouched): `0xFFFFFFFF` for all addresses
- If the sector has been **written before**: Other values depending on what was written

And my output was:

```
Hello from STM32F429!
=== STM32F429 Flash Operations Test ===
Reading from flash sector 11 (0x080E0000):
  Address 0x080E0000: 0x005F004F
  Address 0x080E0004: 0x0061004F
  Address 0x080E0008: 0x0063004F
  Address 0x080E000C: 0x0062004F
Flash read complete!
```

It should output `0xFFFFFFFF` if the flash sector (0x080E0000) was empty before read. However, the STM32 linker might have placed read-only data (.rodata section) here:

- `0x004F` = 79 decimal = ASCII 'O'
- `0x005F` = 95 decimal = ASCII '\_'
- `0x0061` = 97 decimal = ASCII 'a'
- `0x0063` = 99 decimal = ASCII 'c'
- `0x0062` = 98 decimal = ASCII 'b'

Which looks like **string data or constants** from a previous program.

### Q2. Why are we using **pointer dereferencing** (`*ptr`) to read from flash? What does that line of code actually do at the hardware level?

My first answer was "because deferencing returns the value at the memory address".

Claude added more detail to the explanation:

> The CPU puts the address on the address bus, and flash memory responds with data on the data bus.

In assembly, this happens under the hood:

```assembly
LDR r0, [r1] ; Load Register: read from address in r1, put result in r0
```

To wrap it up, the read operation is fairly easy. It just requires 1) a target address to read, and 2) pointer dereferencing. And if the flash sector was empty, it should return 0xFFFFFFFF. Keep in mind that we are using a uint32_t pointer to read memory, and each digit in a hexadecimal number contains 4 bits → 4 bits \* 8 = 32 bits.

## Second Task: Erase

Erase is more complex than read. Before jumping into properties of erase operations, think about:

How do we prevent accidentally erasing our running program?
What could go wrong during an erase operation? How do we know if the erase succeeded?
Why do you think flash memory requires erasing entire sectors rather than just overwriting individual bytes like RAM?

Q1. How do we prevent accidentally erasing our running program?
That's why we always have safety measures. In reality, engineers must:

- Know your memory map (which sectors your code occupies)
- Add safety checks before erasing
- Use linker script symbols to get code boundaries

Q2. What could go wrong during an erase operation?
Power can be lost during erase, or users might try to erase while flash is locked. Or they might even try to erase an invalid sector. For these cases, the STM32 provides status flags to check:

- FLASH_SR_BSY - Flash is busy
- FLASH_SR_WRPERR - Write protection error
- FLASH_SR_PGAERR - Programming alignment error

We need to check these flags to know if the erase succeeded.

### Q3. Flash Erase Mechanism

Since this is a conceptual question, Claude gave the answer right away:

Flash memory stores data by trapping electrons in a floating gate transistor:

- **Writing (Programming):** Inject electrons INTO the gate → bit becomes `0`
- **Erasing:** Remove electrons FROM the gate → bit becomes `1`

I know this goes deep into the physics level, but this is also the beauty of firmware engineering. As you understand the principles behind memory operations, you encounter physical phenomena—how fascinating is that?

- Going from `1` → `0` can be done on individual bits (low voltage) = WRITE
- Going from `0` → `1` requires HIGH voltage that affects a large area (entire sector) = ERASE

That's why we can **write** individual bytes, but **erase** operations require clearing a whole sector. In other words, it's due to a hardware (and circuit physics) limitation of flash technology.

To summarize:

1. Before writing new firmware to Bank B, I must erase those sectors completely
2. Erased flash always reads as `0xFFFFFFFF` (all bits set to `1`)
3. Flash memory has a limited number of erase cycles (~10,000-100,000), so I need to minimize unnecessary erases

### Erase Code

```c
/* USER CODE BEGIN 2 */

printf("\r\n=== Flash Erase Test ===\r\n\r\n");

// First, read before erase
uint32_t test_address = 0x080E0000;
printf("BEFORE erase - Reading from 0x080E0000:\r\n");
for (int i = 0; i < 4; i++)
{
    uint32_t value = *((uint32_t *)(test_address + i * 4));
    printf("  0x%08lX: 0x%08lX\r\n", test_address + i * 4, value);
}

// Now erase Sector 11
printf("\r\nErasing Sector 11...\r\n");

// 1. Unlock flash
HAL_FLASH_Unlock();

// 2. Setup erase
FLASH_EraseInitTypeDef EraseInitStruct;
EraseInitStruct.TypeErase = FLASH_TYPEERASE_SECTORS;
EraseInitStruct.VoltageRange = FLASH_VOLTAGE_RANGE_3;  // 2.7V to 3.6V
EraseInitStruct.Sector = FLASH_SECTOR_11;
EraseInitStruct.NbSectors = 1;

uint32_t SectorError = 0;

// 3. Perform erase
HAL_StatusTypeDef status = HAL_FLASHEx_Erase(&EraseInitStruct, &SectorError);

if (status == HAL_OK)
{
    printf("Erase successful!\r\n");
}
else
{
    printf("Erase FAILED! Error: %lu\r\n", SectorError);
}

// 4. Lock flash
HAL_FLASH_Lock();

// Read after erase
printf("\r\nAFTER erase - Reading from 0x080E0000:\r\n");
for (int i = 0; i < 4; i++)
{
    uint32_t value = *((uint32_t *)(test_address + i * 4));
    printf("  0x%08lX: 0x%08lX\r\n", test_address + i * 4, value);
}

printf("\r\nFlash erase test complete!\r\n");

/* USER CODE END 2 */
```

Key points are:

- **Unlock before, lock after**: Flash operations require unlocking the controller to prevent accidental writes
- **Voltage range matters**: STM32F4 supports different voltage ranges; I used Range 3 (2.7-3.6V) which is typical for this chip
- **Erase is slow**: Erasing a sector can take tens of milliseconds—this will matter later when erasing large application banks

After erasing, if I read from any address in Sector 11, I'll see `0xFFFFFFFF`.

### Erase Code Output

Before erase, the flash contained some leftover data:

```
Hello from STM32F429!
=== Flash Erase Test ===
BEFORE erase - Reading from 0x080E0000:
  0x080E0000: 0x005F004F
  0x080E0004: 0x0061004F
  0x080E0008: 0x0063004F
  0x080E000C: 0x0062004F
Erasing Sector 11...
Erase successful!
AFTER erase - Reading from 0x080E0000:
  0x080E0000: 0xFFFFFFFF
  0x080E0004: 0xFFFFFFFF
  0x080E0008: 0xFFFFFFFF
  0x080E000C: 0xFFFFFFFF
Flash erase test complete!
```

Perfect! After erase, all values are `0xFFFFFFFF` (erased state). This confirms that:

1. The erase operation succeeded
2. Erased flash always reads as all `1`s
3. We can now safely write new data to this sector

## Final Step: Write to Flash

I want to note Claude's questions before giving out the answer code:

**Question 1:** STM32 flash programming has alignment requirements. You can't just write a single byte anywhere you want.

Looking at the HAL documentation, flash writes must be:

- **8-bit** (byte) aligned
- **16-bit** (half-word) aligned
- **32-bit** (word) aligned
- **64-bit** (double-word) aligned

**Why do you think the hardware has these restrictions?**

**Question 2:** We just erased Sector 11, so all bits are `1` (0xFFFFFFFF). If we want to write `0xDEADBEEF` to address `0x080E0000`, what happens at the bit level? In other words,

- Which bits need to change from `1` to `0`?
- Can we change bits from `0` to `1` without erasing?

**Question 3**: Think about this scenario:

```c
// Sector is erased (all 0xFF)
HAL_FLASH_Program(address, 0x12345678);  // Write once
HAL_FLASH_Program(address, 0xAABBCCDD);  // Write AGAIN to same address
```

**What do you think happens?** Can you overwrite flash without erasing?

### Q1. Why do the alignment restrictions exist?

The main reason is because flash memory cells are organized in parallel banks at the physical level. Writing involves programming multiple cells simultaneously for speed and reliability, and the hardware controller expects to program a complete "word" (typically 4 byte) of data in one atomic operation.

### Q2. What happens at the bit level?

Each write performs a bitwise **AND operation** with the current value because you can only change `1` → `0`, never `0` → `1`.

### Q3. Write in the same address twice in a row?

```
Previous value:  0x12345678  = 0001 0010 0011 0100 0101 0110 0111 1000
New write:       0xAABBCCDD  = 1010 1010 1011 1011 1100 1100 1101 1101
Result (AND):    0x02304458  = 0000 0010 0011 0000 0100 0100 0101 1000
```

Flash memory can only change bits from `1` to `0`, never from `0` back to `1` without erasing.
Therefore, the output is not `0xAABBCCDD`, but a corrupted value: `0x02304458`.

Key lesson here: **Always erase before writing new data**!

### Write Code

```c
/* USER CODE BEGIN 2 */

printf("\r\n=== Flash Write Test ===\r\n\r\n");

uint32_t test_address = 0x080E0000;

// Step 1: Erase sector
printf("Step 1: Erasing Sector 11...\r\n");
HAL_FLASH_Unlock();

FLASH_EraseInitTypeDef EraseInitStruct;
EraseInitStruct.TypeErase = FLASH_TYPEERASE_SECTORS;
EraseInitStruct.VoltageRange = FLASH_VOLTAGE_RANGE_3;
EraseInitStruct.Sector = FLASH_SECTOR_11;
EraseInitStruct.NbSectors = 1;

uint32_t SectorError = 0;
if (HAL_FLASHEx_Erase(&EraseInitStruct, &SectorError) == HAL_OK)
{
    printf("  Erase OK\r\n");
}

// Step 2: Write test data
printf("\r\nStep 2: Writing test pattern...\r\n");

uint32_t test_data[] = {
    0xDEADBEEF,
    0xCAFEBABE,
    0x12345678,
    0xAABBCCDD
};

for (int i = 0; i < 4; i++)
{
    uint32_t write_address = test_address + (i * 4);

    // Write 32-bit word
    HAL_StatusTypeDef status = HAL_FLASH_Program(
        FLASH_TYPEPROGRAM_WORD,
        write_address,
        test_data[i]
    );

    if (status == HAL_OK)
    {
        printf("  Written 0x%08lX to address 0x%08lX\r\n",
               test_data[i], write_address);
    }
    else
    {
        printf("  WRITE FAILED at 0x%08lX!\r\n", write_address);
    }
}

HAL_FLASH_Lock();

// Step 3: Read back and verify
printf("\r\nStep 3: Reading back and verifying...\r\n");

bool all_correct = true;
for (int i = 0; i < 4; i++)
{
    uint32_t read_address = test_address + (i * 4);
    uint32_t read_value = *((uint32_t *)read_address);

    printf("  Address 0x%08lX: Read 0x%08lX, Expected 0x%08lX ",
           read_address, read_value, test_data[i]);

    if (read_value == test_data[i])
    {
        printf("[OK]\r\n");
    }
    else
    {
        printf("[MISMATCH!]\r\n");
        all_correct = false;
    }
}

if (all_correct)
{
    printf("\r\n✓ All writes verified successfully!\r\n");
}
else
{
    printf("\r\n✗ Verification failed!\r\n");
}

printf("\r\n=== Flash Write Test Complete ===\r\n");

/* USER CODE END 2 */
```

### Write Code Output

```
=== Flash Write Test ===

Step 1: Erasing Sector 11...
  Erase OK

Step 2: Writing test pattern...
  Written 0xDEADBEEF to address 0x080E0000
  Written 0xCAFEBABE to address 0x080E0004
  Written 0x12345678 to address 0x080E0008
  Written 0xAABBCCDD to address 0x080E000C

Step 3: Reading back and verifying...
  Address 0x080E0000: Read 0xDEADBEEF, Expected 0xDEADBEEF [OK]
  Address 0x080E0004: Read 0xCAFEBABE, Expected 0xCAFEBABE [OK]
  Address 0x080E0008: Read 0x12345678, Expected 0x12345678 [OK]
  Address 0x080E000C: Read 0xAABBCCDD, Expected 0xAABBCCDD [OK]

✓ All writes verified successfully!

=== Flash Write Test Complete ===
```

## Debugging: The Word Alignment Problem

Here's the boot state struct I wanted to write to flash:

```c
typedef struct {
    uint32_t magic_number;      // 4 bytes
    uint8_t bank_a_status;      // 1 byte
    uint8_t bank_b_status;      // 1 byte
    uint8_t active_bank;        // 1 byte
    uint32_t crc32;             // 4 bytes
} boot_state_t;  // Total: 11 bytes
```

This looks fine, and it even looks efficient because it's using the minimum memory possible. However, this causes a problem when the compiler adds padding to align the `crc32` field. As a result, it becomes a 12-byte struct. But worse, when I tried to write it word-by-word, I was writing **partial words**, and the STM32 HAL rejected it.

**The error:** `HAL_FLASH_Program()` would return `HAL_ERROR`, and my writes silently failed.

### Solution 1: Make all fields `uint32_t` to ensure natural word alignment

```c
typedef struct {
    uint32_t magic_number;      // 4 bytes
    uint32_t bank_a_status;     // 4 bytes
    uint32_t bank_b_status;     // 4 bytes
    uint32_t active_bank;       // 4 bytes
    uint32_t crc32;             // 4 bytes
} boot_state_t;  // Total: 20 bytes = 5 words
```

### Solution 2: Write a helper function that handles non-word-sized data by padding to the next word boundary

First, unlock flash.

```c
HAL_FLASH_Unlock();
```

Then, it writes only words that are full. If size is `9`, then it will write 2 words (`9//4 = 2`, 1 remaining byte).

```c
for (int i = 0; i < num_full_words; i++) {
    if (HAL_FLASH_Program(FLASH_TYPEPROGRAM_WORD, address, words[i]) != HAL_OK) {
        HAL_FLASH_Lock();
        return -1;
    }
    address += 4;
}
```

Lastly, for any remaining bytes, it first constructs a word padded as `0xFFFFFFFF` (the erased state) and then write remaining data:

```c
// Handle remaining bytes (if any) by padding with 0xFF
uint16_t remaining = size % 4;
if (remaining > 0) {
	uint32_t last_word = 0xFFFFFFFF;  // Start with erased state
	memcpy(&last_word, (uint8_t*)data + num_full_words * 4, remaining);

	if (HAL_FLASH_Program(FLASH_TYPEPROGRAM_WORD, address, last_word) != HAL_OK) {
		HAL_FLASH_Lock();
		return -1;
	}
}
```

This ensures every write is exactly 32 bits, satisfying the alignment restriction.

All combined:

```c
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

    // Handle remaining bytes (if any) by padding with 0xFF
    uint16_t remaining = size % 4;
    if (remaining > 0) {
        uint32_t last_word = 0xFFFFFFFF;  // Start with erased state
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

**Lesson learned:** STM32 flash programming requires word alignment. Always design persistent structures as multiples of 4 bytes, or handle partial words explicitly.

## Key Takeaways from Phase 1

1. **Flash is not RAM**: You can't just overwrite it. Erase → Write → Verify is the only safe workflow.
2. **Sectors are the atomic unit of erasure**: You can't erase individual bytes. Plan your memory layout accordingly.
3. **Erased flash reads as `0xFF`**: This is useful for detecting uninitialized flash.
4. **Word alignment is mandatory**: STM32F4 flash writes must be 32-bit aligned. Structures should be designed as multiples of 4 bytes.
5. **Always verify**: After writing critical data, read it back and check. Flash can always fail.
6. **Unlock/Lock discipline**: Always unlock before flash operations, and always lock after—even if an error occurs.

## Code Summary

For reference, here are the complete flash helper functions I developed in Phase 1 (these later became part of `boot_state.c`):

```c
// Read from flash (trivial - just dereference pointer)
uint32_t flash_read_word(uint32_t address) {
    return *((uint32_t*)address);
}

// Erase a sector
int flash_erase_sector(uint32_t sector_number) {
    HAL_FLASH_Unlock();

    FLASH_EraseInitTypeDef erase_config;
    erase_config.TypeErase = FLASH_TYPEERASE_SECTORS;
    erase_config.Sector = sector_number;
    erase_config.NbSectors = 1;
    erase_config.VoltageRange = FLASH_VOLTAGE_RANGE_3;

    uint32_t sector_error = 0;
    HAL_StatusTypeDef status = HAL_FLASHEx_Erase(&erase_config, &sector_error);

    HAL_FLASH_Lock();
    return (status == HAL_OK) ? 0 : -1;
}

// Write arbitrary data (handles word alignment)
int flash_write_data(uint32_t address, const void *data, uint16_t size) {
    HAL_FLASH_Unlock();

    const uint32_t *words = (const uint32_t*)data;
    uint16_t num_full_words = size / 4;

    for (int i = 0; i < num_full_words; i++) {
        if (HAL_FLASH_Program(FLASH_TYPEPROGRAM_WORD, address, words[i]) != HAL_OK) {
            HAL_FLASH_Lock();
            return -1;
        }
        address += 4;
    }

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
