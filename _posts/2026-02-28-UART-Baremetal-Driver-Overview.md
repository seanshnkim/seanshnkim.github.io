---
layout: post
title: UART Bare-Metal Driver Project Overview
date: 2026-02-28 16:17:34
categories: Firmware
toc:
   beginning: true
   sidebar: left
---

## 1. What We're Building — and Why the Hard Way

The goal of this project is to build an **interrupt-driven STM32 UART driver from scratch**. By bare-metal it means, "with no HAL, no CubeMX, and no auto-generated code". Just registers, datasheets, and a blank `main.c`.

Before diving in, it's worth being clear about what a device driver actually is. A _driver_ is software that **abstracts hardware**.

It sits between the application layer (operating systems) and the physical hardware, translating generic commands like `read()` / `write()` into hardware-specific register operations. Think of it as a translator: the application doesn't need to know which specific hardware it's talking to, and the hardware doesn't need to know anything about your application.

{% include figure.liquid
   loading="eager"
   path="/assets/post-attachments/2026-02-28/driver-illustration.jpeg"
   class="img-fluid rounded z-depth-1" width="500px"
   %}

There are two broad categories of drivers:

- **Linux kernel drivers**: They run on a host computer, mediated by the OS kernel
- **Bare-metal / RTOS peripheral drivers**: They run directly on a microcontroller chip (MCU) like STM32. No operating system is involved.

This project falls into the second category. "Bare-metal" specifically means we're not relying on ST's Hardware Abstraction Layer (HAL) or any CubeMX-generated initialization code. And discarding software abstractions means committing to incredibly tedious, low-level work.
But why are we putting ourselves through this "reinventing the wheel"? It's because writing register-level code forces you to understand exactly what the hardware is doing at every step. As an embedded engineer, peeling back the abstraction layers and digging into how things actually work at the foundation is one of the most satisfying parts of the job.

### What You'll Learn From This Project (Or, What I Hoped to Learn)

There is good news: every concept here generalizes directly to other peripherals and future drivers.

- **How hardware registers map to software** — memory-mapped I/O is the foundation of all embedded peripheral programming
- **Interrupt-driven design** — understanding the difference between polling and interrupts, and why it matters for real systems
- **Peripheral initialization sequence** — every peripheral follows the similar pattern: enable clock → configure pins → set parameters → enable interrupt → enable peripheral. Once you learn it how to build UART, then SPI and I2C become much less intimidating
- **`volatile` and memory barrier discipline** — learning why these keywords exist and when to use them
- **Circular (ring) buffer** — this is a classic UART RX pattern you'll reuse in other drivers throughout your career

---

## 2. The Full Roadmap of the Project

```
========== PHASE 1 ==========
1. Enable clocks    → RCC->AHB1ENR  (GPIOA)
                    → RCC->APB2ENR  (USART1)

2. Configure pins   → PA9, PA10 to Alternate Function mode
                    → Set AF7 for both pins

========== PHASE 2 ==========
3. Configure USART1 → Set BRR (baud rate)
                    → Set word length, stop bits, parity
                    → Enable TX/RX (Transmit and Receive)
                    → Enable RXNE interrupt
                    → Enable USART1 (UE bit)

========== PHASE 3 ==========
4. Configure NVIC   → Enable USART1_IRQn (NVIC_EnableIRQ)
                    → Set priority

5. Write ISR        → USART1_IRQHandler()

========== PHASE 4 ==========
6. Implement Circular Buffer
```

---

## 3. Setting Up Hardware

{% include figure.liquid
   loading="eager"
   path="/assets/post-attachments/2026-02-28/hardware-to-prepare_labeled.jpeg"
   class="img-fluid rounded z-depth-1" width="500px"
   %}

The hardware setup is minimal:

- an STM32 development board
- a USB cable
- a laptop with STM32CubeIDE installed

I used the **STM32F429I-DISC1**, but any STM32F4xx series board should work with minor adjustments.

| Item                     | Detail                                            |
| ------------------------ | ------------------------------------------------- |
| Board                    | STM32F429I-DISC1                                  |
| USART peripheral         | USART1                                            |
| TX pin                   | PA9                                               |
| RX pin                   | PA10                                              |
| Connection path          | PA9/PA10 → SB11/SB15 (closed) → ST-Link VCP → USB |
| USB-to-TTL adapter       | Not needed — ST-Link VCP handles it               |
| Solder bridges SB11/SB15 | Closed (verified physically)                      |

Before writing any code, let's verify that the board is visible to my Linux laptop (the host machine).
Plug the board in via USB, then run:

```bash
ls /dev/ttyACM*

# On macOS:
ls /dev/ttyUSB*
```

I saw my STM board is detected as `/dev/tty/ACM0` in Linux laptop. If nothing appears, check the USB cable and confirm the ST-Link firmware is up to date.

---

## 4. Setting Up a Bare-Metal Project in STM32CubeIDE

As hardware is all set up, let's get our software ready:

1. Open STM32CubeIDE
2. `File → New → STM32 Project`
3. In the Board Selector, search for **STM32F429I-DISC1** (or your exact chip) in Commercial Part Number
4. Select the board entry (on the right bottom panel) and click Next
5. Give a project name, e.g. `uart_bare_metal`
6. Under "Targeted Project Type," select **`Empty`**, not `STM32Cube`. If you click `STM32Cube`, it will create all the HAL and CubeMX template code automatically, which is unnecessary for a bare-metal project!
7. Click Finish.

Selecting `Empty` option gives you a minimal project with no HAL, no CubeMX, or no generated code. Just the startup file, the linker script, and a blank `main.c` exists only.

Once created, the resulting project structure should look like:

```
uart_bare_metal/
├── Core/Src/
│   ├── main.c          ← your driver code goes here
│   ├── syscalls.c      ← C runtime stubs (_write, _sbrk) — ignore for now
│   └── sysmem.c        ← heap management stub — ignore for now
├── Startup/
│   └── startup_stm32f429zitx.s
├── STM32F429ZITX_FLASH.ld   ← use this one
└── STM32F429ZITX_RAM.ld     ← not used
```

{% include figure.liquid
   loading="eager"
   path="/assets/post-attachments/2026-02-28/empty-project-file-structure1.png"
   class="img-fluid rounded z-depth-1" width="500px"
   %}

There's one more step before the project will build cleanly. If you try to build the project with these default files, it will return multiple errors. It's because we're missing the **CMSIS and STM32 device headers.** These define the register structures that all your driver code will depend on. Although the project is bare-metal, it still needs software support from the CMSIS and STM32 device headers.

The easiest way to get the headers is to copy them from an existing STM32Cube project.

{% include figure.liquid
   loading="eager"
   path="/assets/post-attachments/2026-02-28/empty-project-file-structure2.png"
   class="img-fluid rounded z-depth-1" width="500px"
   %}

Add the following files under `Inc/`:

```
Inc
├── cmsis_compiler.h
├── cmsis_gcc.h
├── cmsis_version.h
├── core_cm4.h
├── mpu_armv7.h
├── stm32f429xx.h
├── stm32f4xx.h
├── system_stm32f4xx.h
```

And add a source file `system_stm32f4xx.c` under `Src/`. `system_stm32f4xx.c` configures the system clock (HCLK), sets up flash memory latency, and initializes the microcontroller after reset:

```
Src
├── system_stm32f4xx.c
```

---

## 5. Sidenotes (Questions You Might Have Asked... Or Not)

### 5.1. Does Learning How to Build a UART Driver Transfer to SPI and I2C Driver?

**Yes**. UART is the right starting point because it's the simplest of the three protocols, but it introduces every foundational concept.

```
UART (interrupt-driven)
    ↓ teaches you interrupt patterns + register workflow
SPI
    ↓ same foundation, adds duplex + mode configuration
I2C
    ↓ hardest — adds addressing, ACK, repeated start, state machine
```

- Interrupt patterns
- Register workflow
- Initialization sequence

Most of the actual code of SPI or I2C driver won't be reused directly, but the mental model will transfer completely. I actually considered choosing either **SPI** or **I2C** as the project topic, but UART still seems to be the best starting point. It's the simplest protocol but exposes every foundational concept.

### 5.2. Do I Need a USB-to-TTL Serial Adaptor For Debugging?

**No**. But here's why that question is worth asking in the first place.

```
PC (USB)  ←→       ST-Link MCU         ←→  Target MCU UART (STM32F429)
              [VCP / USB-CDC class]        [via SB11/SB15 solder bridges]
                acts as the bridge
```

A laptop communicates over USB, but an STM32 UART peripheral speaks TTL-level serial. Normally, you'd need a USB-to-TTL adapter to bridge those two worlds. The adaptor converts USB packets to UART frames so your PC can open a COM port, and exchange serial data with the MCU. Without one, there's no straightforward way to connect a bare UART pin to a laptop.

On the STM32F429I-DISC1, however, the on-board **ST-Link V2 debugger** handles this automatically. The ST-Link firmware exposes a **Virtual COM Port (VCP)**, which the PC sees as a standard serial port. To summarize it, no external adapter is needed.

From the STM32F429I-DISC1 user manual (UM1670, p.15):

> "The ST-LINK/V2-B on STM32F429I-DISC1 supports Virtual COM port (VCP) on U2 pin 12 (ST-LINK_TX) and U2 pin 13 (ST-LINK_RX), which are connected to the STM32F429 target STM32 USART1 (PA9, PA10) for Mbed support, thanks to the SB11 and SB15 solder bridges."[^3]

{% include figure.liquid
   loading="eager"
   path="/assets/post-attachments/2026-02-28/solder-bridge.jpeg"
   class="img-fluid rounded z-depth-1" width="500px"
   %}

### 5.3. USART1 vs. PA9/PA10 — What's the Difference?

To be honest, this point confused me while I was digging into the datasheets. It seemed like `USART1` and `PA9` all refer to the same thing. But they actually represent different concepts.

- **USART1** is the _peripheral_. A hardware block inside the STM32 chip that handles serial communication logic
- **PA9 and PA10** are the _physical pins_ on the chip where USART1's TX and RX signals appear in the real world

If configured USART1 in software, but the signal only appears in the real world through PA9 (TX) and PA10 (RX). The setup is:

```
STM32F429 (USART1) → PA9/PA10 → SB11/SB15 → ST-Link VCP → USB → Laptop
```

### 5.4. What Does The Startup File Actually Do?

I once had a common misconception about the startup file (`startup_stm32f429zitx.s`): "Doesn't it initialize peripherals or clocks?"
The answer is **No**. It does not initialize peripherals or clocks. That's a programmer's job to implement in `main()` function. What the startup file does is prepare the C runtime environment so that `main()` can run at all.

The startup file takes steps in the following order:

1. Sets up the **stack pointer**
2. Calls `SystemInit()` — minimal clock setup, runs before `main()`
3. Copies **initialized global variables** from flash to RAM
4. **Zero-fills the BSS segment** — clears uninitialized globals to 0
5. Calls **static constructors** (relevant for C++)
6. Calls **`main()`**

It works behind-the-scenes, making C's memory model work correctly before your first line of code executes.
That said, **the peripheral and clock initialization is a programmer's responsibility to fill inside `main()`.**

### 5.5. I See Two Linker Scripts Created. Which Linker Script Do I Use?

The linker script tells the linker **where to place code, data, and stack in memory**. There are two linker scripts generated by default in a STM32CubeIDE project:

- **`FLASH.ld`** — the standard configuration: code lives permanently in flash, data in RAM.
- **`RAM.ld`** — loads everything into RAM. Faster for debug cycles but not suitable for normal use.

We don't need RAM linker script for now; instead, we will be using `FLASH.ld` only.

### 5.6. What Are `syscalls.c` and `sysmem.c`?

They are minimal C runtime stubs. The C standard library assumes certain low-level functions exist, such as `_write()` (used by `printf`) and `_sbrk()` (used by `malloc`). On a bare-metal system with no OS, there's nothing to provide these by default. `syscalls.c` and `sysmem.c` provide empty or minimal implementations so the linker doesn't complain. You can ignore them for the purposes of this driver.

---

## 6. Reference For The Project

There are two main datasheets for STM32F429I-DISC1.

1. RM0090: 1,757 page long, Reference Manual (STM32F405/415, STM32F407/417, STM32F427/437 and STM32F429/439 advanced Arm®-based 32-bit MCUs)
2. UM1670: 32 page long, User Manual (Discovery kit with STM32F429ZI MCU)

RM0090 has general information about registers of STM32F4xx devices, while UM1670 has specific pin numbers or AF (Alternate Function) numbers for the STM32F429I-DISC1 device.

[^1]: p.270, 8.3. GPIO functional description, RM0090 Reference Manual

[^2]: p.276, Figure 27. Selecting an alternate function on STM32F42xxx and STM32F43xxx, RM0090 Reference Manual

[^3]: p.15, 6.3.3. VCP Configuration, UM1670

[^4]: p.22, Table 7. STM32 pin description versus board functions, UM1670
