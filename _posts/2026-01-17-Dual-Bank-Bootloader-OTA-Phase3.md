---
layout: post
title: "Bootloader with OTA Phase 3: Dual Bank Selection"
date: 2026-01-17 01:26:50
categories: Firmware
---

## Phase 3 Overview

In Phase 1 and 2, we discussed flash operations and created a minimal bootloader and application (= main firmware.[^1]) to run basic tests. But we haven't tackled the core concept yet: **dual bank selection**. We will store the application in two separate regions (banks) of memory.

(Ignore this. I will take care of this later. There should be a simple diagram that describes the relationship between bootloader and dual, two banks of the main application. Or a picture that has a bootloader impersonated as, maybe, a robot, and the "bootloader robot" choosing between two banks in the flash memory map)

The reason for setting up dual banks is simple: by dividing flash memory into two "banks", the bootloader can roll back to the previous working version (Bank A) if the new firmware (in Bank B) is broken. This backup memory architecture provides **fail-safe updates**.

To design a dual bank system, we need to answer these questions:

1. Where should the dual banks be stored?
2. How should the bootloader choose between Bank A and Bank B for booting? To be more specific, under what circumstances should it select Bank A or Bank B? How should it respond when Bank A fails? How can we even know that Bank A has failed?
3. After we select the bank, how do we validate the application?

And to answer Question 2, we will discuss **boot state structure** which contains the core information for dual bank selection.

## Memory Map of Dual Banks

The boot flag, or boot state information, should be located in a dedicated flash sector.

Let's consider an alternative scenario. If the boot flag were at the end of the bootloader sector, and you needed to update the flag, you'd have to erase the entire bootloader sector. This risks bricking your device if power is lost during the erase. By assigning a dedicated sector, you can erase and write the boot flag without touching the bootloader.

Let's review the STM32 flash memory layout from Phase 1:

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

- The processor always starts at 0x08000000 after reset.
- Bank A is for primary application region, 192KB.
- Bank B is secondary application region for updates, 256KB.
- Boot state is located at 0x08080000, a dedicated sector. It is isolated from both the bootloader and application banks.

This separation is crucial. We can safely modify the boot state without risking corruption of the bootloader or either application bank.

## Dual-Bank Selection Logic

Now that we know where the two banks are located in flash memory, it's time to look at how the bootloader selects one of them.

The decision flow:

1. Read boot state from flash
2. Is magic_number valid?
   - NO → Initialize boot_state with defaults, try Bank A first
   - YES → Continue
3. Check active_bank field:
   - BANK_A → Validate Bank A
     - Valid? → Boot Bank A
     - Invalid? → Mark Bank A as CORRUPTED, try Bank B
   - BANK_B → Validate Bank B
     - Valid? → Boot Bank B
     - Invalid? → Mark Bank B as CORRUPTED, try Bank A
4. Fallback Strategy (if selected bank fails):
   - Try the OTHER bank
   - If that also fails → Enter error/recovery mode

This logic ensures that the bootloader always attempts to boot something. The worst-case scenario is that both banks are invalid. In this case, the bootloader will enter a safe recovery mode (more on this in Phase 6).

## Boot State Structure

Here's the simplest structure:

```c
typedef enum {
    BANK_STATUS_INVALID = 0x00,
    BANK_STATUS_VALID = 0x01,
    BANK_STATUS_TESTING = 0x02,  // For Phase 6: boot attempt in progress
} bank_status_t;

typedef struct {
    uint32_t magic_number;           // e.g., 0xDEADBEEF
    bank_status_t bank_a_status;
    bank_status_t bank_b_status;
    active_bank_t active_bank;
    uint32_t crc32;                  // To verify structure integrity
} boot_state_t;
```

Let's break down each field and understand why it's essential:

### Bank Status

Both Bank A and B have its own status field. The possible states are:

- **`BANK_STATUS_INVALID` (0x00)**: The bank is empty or the firmware in the bank is corrupted. The bootloader should not attempt to boot from this bank.
- **`BANK_STATUS_VALID` (0x01)**: The bank contains verified, working firmware.
- **`BANK_STATUS_TESTING` (0x02)**: The bank contains newly flashed firmware that hasn't been validated yet. When the bootloader boots from a TESTING bank, it will run the application but monitor whether it successfully completes initialization.

Bank status can be modified or updated.

- If the bank contains a new firmware, but not validated yet -> **`BANK_STATUS_TESTING`**.
- After a successful boot or after a firmware update has been validated -> **`BANK_STATUS_VALID`**.
- If the application crashes or fails to report success -> **`BANK_STATUS_INVALID`**. And it rolls back to the other bank. This is crucial for fail-safe updates (we'll implement this in Phase 6).

The TESTING state is the key to safe updates. Without it, if you flash broken firmware to Bank B and mark it as VALID immediately, the bootloader might boot into a non-functional application with no way to recover. The TESTING state creates a probationary period where the new firmware must prove itself before being trusted.

### Active Bank

Which bank should the bootloader attempt to boot from? `active_bank` field answers this question. The possible values are:

- **`BANK_A` (0x00000000)**: Boot from Bank A at address 0x08010000
- **`BANK_B` (0x00000001)**: Boot from Bank B at address 0x08040000
- **`BANK_INVALID` (0xFFFFFFFF)**: No valid bank selected (error state)

Why do we need this field? You might think the status fields are sufficient—just boot whichever bank is marked VALID. But the `active_bank` field explicitly records the _last known good choice_. This is important for fallback logic: if Bank B (the active bank) fails validation at boot time, the bootloader knows to try Bank A instead. It also makes the boot state easier to debug: you can see at a glance which bank was supposed to be running.

### Magic Number

The magic number, or magic debug value[^2] is a specific constant value (like `0xDEADBEEF`) for checking if the data in memory is corrupted. It is written at the beginning of the boot state structure. When the bootloader reads the boot state from flash, the first thing it checks is whether this magic number is equal to the expected value (`0xDEADBEEF`).

By checking for the magic number first, we can immediately distinguish between:

- A valid boot state structure that was intentionally written
- Uninitialized or corrupted flash memory

If the magic number is missing or incorrect, the bootloader knows it needs to initialize the boot state with safe defaults (e.g., try Bank A, mark both banks as INVALID until validated).

### CRC32 (Cyclic Redundancy Check)

CRC32 is another value for checking if the data in memory is corrupted or not. The difference between magic number and CRC is that CRC takes all the bytes in the boot state structure, performs mathematical operations (checksum algorithm) on them, and produces a single 32-bit number. **If you change even 1 bit of the original data, the CRC32 will be completely different.**

1. After writing the boot state to flash, we calculate the CRC32 of all the fields (excluding the CRC32 field itself) and store it in the structure.
2. When reading the boot state back, we recalculate the CRC32 and compare it to the stored value.

Then why do we both need magic number and CRC32? Without CRC32, you'd miss subtle corruption that happened after the structure was written. For example, if a single bit flips in the `active_bank` field, the magic number would still be valid, but the bootloader might try to boot from the wrong bank.

But meanwhile, we still need a magic number. CRC32 takes significant time calculating the checksum. If we only have CRC32 (it would still work) but you might have to waste time calculating checksum on random uninitialized flash.

## What's Next: Implementing the Boot Logic

In Phase 4, we will dive into the actual implementation of boot state structure. We will also build read/write/erase functions for boot state.

The boot state structure we've designed here is the foundation for all of Phase 4's work. Every decision the bootloader makes—which bank to try, whether to trust a firmware image, when to roll back—depends on the information stored in this small structure.

---

[^1]: For those who are confused with the term "application", please refer to the note I wrote in Intro: <Meaning of “Application” in This Discussion>.

[^2]: https://en.wikipedia.org/wiki/Magic_number_(programming)
