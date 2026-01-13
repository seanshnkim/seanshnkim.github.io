# Building My First Firmware Project with Claude

When I asked Claude: "I am a grad student who is interested in firmware engineering. What projects would be good to start with?", Claude suggested seven options.
Among them, building a custom bootloader was my choice. First, there were plenty of documents and open-source projects to reference. More importantly, bootloader development touches on concepts that are fundamental in embedded systems: memory management, hardware initialization, communication protocols, and safety-critical design.

## What Is a Bootloader? And Why Should You Care?
A bootloader is a small program (yes, it's software!) that runs right after reset, executed from ROM (Read Only Memory) or flash when the device powers on. It initializes hardware and loads the main firmware image stored in flash into RAM.

To make this easier to understand, I will use an analogy. 
Imagine a computer is like a kitchen. Then **a bootloader is like a "opening manager" for a kitchen**. Before opening hours, the kitchen is dark, the equipment is off, and nothing is ready to cook. Someone needs to:
- Turn on the ovens and check they're at the right temperature
- Make sure the refrigerators are working
- Verify the gas lines are connected properly
- Check that all the cooking stations have their tools ready 

Only then the manager will hand control over to the head chef to start cooking.

 Similarly, a microcontroller hardware has nothing configured yet before pressing the power button. The bootloader's job is to:
- Wake up the hardware (clocks, memory, peripherals) so that higher-level firmware can run correctly
- Decide which application firmware to run if there are multiple versions installed
- Verify that the chosen firmware is safe to execute. For "secure boot", it can check digital signatures or hashes to allow only trusted firmware
- Transfer control to the main application
- Offer fallback/rollback behavior (e.g., dual‑image or recovery mode) if the main application is missing, corrupt, or fails to start

Bootloaders are everywhere in modern electronics, but we rarely see them because they're not a type of software we can directly interact with. For example, every STM32 microcontroller ships with a built-in bootloader in ROM that lets you flash firmware over USB or UART. Arduino boards use a bootloader to accept sketches over USB without needing a dedicated programmer. Wireless earbuds or car's dashboard all have bootloaders that enable firmware updates without replacing the hardware.


## Core Project Goals
I focused on three specific challenges that represent key bootloader functionality: 

1. **Dual-Bank Architecture**: By dividing flash memory into two "banks", the bootloader can roll back to the previous working version (Bank A) if the new firmware (in Bank B) is broken. This backup memory architecture provides **fail-safe updates**.
2. **Persistent State Management**: The bootloader state (current active bank, boot failure count, etc.) has to survive across power on/off cycles, which requires read/write operations in flash memory. Flash read/erase/write operations are quite different from just assigning values to variables and understanding this distinction is crucial.
3. **Over-The-Air (OTA) Protocol**: OTA allows engineers to fix bugs, patch security issues, and ship new features to devices in the field without physically touching them. But in this project, I used UART (with a USB-A to Mini-USB cable) to send firmware updates from a host computer to the microcontroller. The OTA feature includes chunking (breaking the firmware into 1KB pieces), CRC32 verification (detecting corrupted data), retransmission on errors, and atomic switching. 

Since I developed this bootloader for self-learning purposes, it lacks most of the features required in production bootloaders. Instead I chose to focus on these three core concepts as to study them in depth.

## How and Why I wrote this Blog
I tried my best to make my blog posts "**process-driven**", not "result-driven". I focused on these two: 
1) The conversations with Claude AI
2) Debugging steps.
 
I avoided simply listing information like a textbook. Instead, I described the questions I had and how I solved problems.

To make one thing clear, this project is the result of collaboration between Claude AI and myself. Without Claude, I would have never been able to start or finish the project. For beginners like me who want to learn firmware engineering, AI feels like a launch booster that helps push beyond the steep learning curve. I found potential in AI not just as a tool for writing code, but as an attentive tutor that helps you think, ask questions, and make gradual progress on projects at your own level.

I hope that beginners like me in firmware engineering will gain courage from reading my posts. I'm pretty sure some people might think, "Oh wow, this guys basically AI prompted his whole project? I could definitely do better than this!" - and honestly, nothing would make me happier if my posts annoy (or inspire) someone to start their own project.


## What You'll Find in This Series

I've broken down the project into phases, roughly corresponding to how I built it:

- **Phase 1: Understanding Flash Operations** - How to read, write, and erase flash memory on the STM32F429. Why flash requires word alignment, and how to handle data structures that aren't neat multiples of 4 bytes.

- **Phase 2: Minimal Bootloader and Jump-to-Application** - Creating a bootloader that runs at address `0x08000000` and can transfer control to an application at `0x08010000`. Vector table relocation, stack pointer initialization, and the ARM Cortex-M startup sequence.

- **Phase 3: Dual-Bank Selection** - Implementing the logic to choose between Bank A and Bank B based on a flag stored in flash. Validating the application before jumping (checking the stack pointer, verifying the reset handler).

- **Phase 4: Persistent State Management** - Designing the `boot_state_t` structure, implementing CRC32 integrity checks, and writing atomic read/write/erase functions. Handling structure padding and word alignment constraints.

- **Phase 5: OTA Protocol Implementation** - Building the packet-based protocol for firmware downloads. Chunking, per-chunk CRC verification, flash writes during transfer, and retransmission logic.

- **Phase 6: Verification and Rollback** - Adding safety mechanisms to prevent bricking. Boot attempt counters, automatic rollback after failed boots, and safe mode when no valid firmware exists.

- **Phase 7: Lessons Learned and Future Improvements** - What worked, what didn't, and what I'd do differently next time. Ideas for production hardening (secure boot, WiFi OTA, power-failure resilience).

Each post will include the actual code I wrote, the debugging challenges I hit, and the lessons I extracted.

## Hardware and IDE Specifications

- GitHub Link:
- Hardware and IDE: STM32F429I-DISC1 / STM32CubeIDE
- OS: Ubuntu 24.04 LTS
