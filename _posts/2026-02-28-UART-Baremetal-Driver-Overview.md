---
layout: post
title: UART Bare-Metal Driver Project Overview
date: 2026-02-28 16:17:34
categories: Firmware
toc: '{"beginning":true,"sidebar":"left"}'
---

## 1. Project Overview

The project goal is to build an **interrupt-driven STM32 bare-metal UART driver**.

A device driver is software that **abstracts hardware**. It sits between the OS (or application layer) and physical hardware, translating generic commands like `read()` / `write()` into hardware-specific register operations. Think of it as a "translator" between software that doesn't know about hardware specifics and hardware that doesn't know about software.

Linux kernel driver runs on a laptop, interfaces via the kernel. Bare-metal / RTOS peripheral driver runs directly on MCU (e.g. STM32). No OS needed.

**Bare-metal** means "without relying on HAL or CubeMX-generated code". Then why such a hassle? It is to develop a deep understanding of register-level embedded programming. 그리고 임베디드 엔지니어로서, 추상화되어 있는 레이어를 벗겨내 그 안의 작동원리를 근본부터 파헤쳐보는 건 늘 재미있는 일이다.

### In This Project, We Will Learn...

- How hardware registers map to software
- Experience with interrupt-driven design
- **Peripheral initialization sequence**. every peripheral follows: enable clock → configure pins → set parameters → enable interrupt → enable peripheral
- **Volatile and memory barrier discipline**. Learn why these matter in UART and it carries over directly
- **Circular buffer / ring buffer**. A classic UART pattern for interrupt-driven RX that you'll reuse in other drivers

```
1. Enable clocks    → RCC->AHB1ENR  (GPIOA)
                    → RCC->APB2ENR  (USART1)

2. Configure pins   → PA9, PA10 to Alternate Function mode
                    → Set AF7 for both pins

3. Configure USART1 → Set BRR (baud rate)
                    → Set word length, stop bits, parity
                    → Enable TX, RX
                    → Enable RXNE interrupt
                    → Enable USART1 (UE bit)

4. Configure NVIC   → Enable USART1_IRQn
                    → Set priority

5. Write ISR        → USART1_IRQHandler()
```

### In Phase 1, We Will....

But we only started Phase 1 of the entire project. There are total three phases: Phase 1, Phase 2, and Phase 3. In this phase, we will:

- Set up an empty bare-metal project in STM32CubeIDE. Since it's "bare-metal", there should be **NO** CubeMX or HAL code
- Understand what startup file and linker script are actually doing
- Write register-level code to 1) enable the clock and 2) configure GPIO

### Does UART project help with SPI and I2C later?

There are two other commonly used protocols: SPI and I2C. If I had to build a custom driver for SPI or I2C, how would they be different from UART?

```
UART (interrupt-driven)
    ↓ teaches you interrupt patterns + register workflow
SPI
    ↓ same foundation, adds duplex + mode configuration
I2C
    ↓ hardest — adds addressing, ACK, repeated start, state machine
```

If I were to implement bare-metal SPI and I2C driver, then Interrupt patterns, register workflow, and init sequence all transfer. However, code will not be reused directly.

UART is the best starting point. It's the simplest protocol but exposes every foundational concept.

---

## 2. Hardware to Prepare

{% include figure.liquid
   loading="eager"
   path="/assets/post-attachments/2026-02-28/hardware-to-prepare_labeled.jpeg"
   class="img-fluid rounded z-depth-1" width="500px"
   %}

![[hardware-to-prepare_labeled.jpg]]

With a STM32 board, a cable, and a laptop with STM32CubeIDE installed, you can easily build your own custom STM32 bare-metal UART driver.
I used STM32F429I-DISC1, but any other STM32F4xxx board is fine.

| Item                     | Detail                                               |
| ------------------------ | ---------------------------------------------------- |
| Board                    | STM32F429I-DISC1                                     |
| USART peripheral         | USART1                                               |
| TX pin                   | PA9                                                  |
| RX pin                   | PA10                                                 |
| Connection path          | PA9/PA10 → SB11/SB15 (closed ✅) → ST-Link VCP → USB |
| USB-to-TTL adapter       | Not needed — ST-Link VCP handles it                  |
| Solder bridges SB11/SB15 | Closed ✅ (verified physically)                      |

### 2.1. Do I need a USB-to-TTL serial adaptor?

The answer is "No".
To explain first what a USB-to-TTL serial adaptor is, and why it may be necessary:

My laptop sends data over USB (=protocol), but my STM32 board receives data through UART at TTL-level serial. The adapter converts USB packets ↔ UART frames so your PC can open a COM port and exchange serial data with the MCU. Without it, you'd have no way to connect a bare UART to a PC directly. That's why we should raise this question: Do I need a USB-to-TTL serial adaptor?

Thanks to on-board ST-Link V2 debugger, it handles the adaptor's task. To be more specific, the ST-Link firmware exposes a **Virtual COM Port (VCP)** which the PC sees as a standard serial port.

```
PC (USB)  ←→       ST-Link MCU         ←→  Target MCU UART (STM32F429)
              [VCP / USB-CDC class]        [via SB11/SB15 solder bridges]
                acts as the bridge
```

In the STM32F429I-DISC1 user manual (UM1670), it says:

> "The ST-LINK/V2-B on STM32F429I-DISC1 supports Virtual COM port (VCP) on U2 pin 12 (ST-LINK_TX) and U2 pin 13 (ST-LINK_RX), which are connected to the STM32F429 target STM32 USART1 (PA9, PA10) for Mbed support, thanks to the SB11 and SB15 solder bridges."[^3]

{% include figure.liquid
   loading="eager"
   path="/assets/post-attachments/2026-02-28/solder-bridge.jpeg"
   class="img-fluid rounded z-depth-1" width="500px"
   %}

![[solder-bridge.jpg | 500]]

### 2.2. I'm confused with the terms: USART1 vs. PA9 (or PA10)

- **USART1** is the _peripheral_. It is the hardware block inside the STM32 chip that handles serial communication.
- **PA9 and PA10** are the _physical pins_ on the chip where USART1's TX and RX signals come out.

If configured USART1 in software, but the signal only appears in the real world through PA9 (TX) and PA10 (RX). The setup is:

```
STM32F429 (USART1) → PA9/PA10 → SB11/SB15 → ST-Link VCP → USB → Laptop
```

## 3. Setting Up a Bare-Metal Project in STM32CubeIDE

Before writing the driver, let's check if my Linux laptop detects the STM32 board.

1. Plug your board into your laptop via USB
2. Check which COM port / ttyUSB device your laptop sees the board as

Linux command that lists out any file (device is also considered file in Linux) named `/dev/ttyACM*`:

```
ls /dev/ttyACM*

# or if Mac:
ls /dev/ttyUSB*
```

I see the STM board is detected as `/dev/tty/ACM0`.

And then, follow these steps carefully:

1. Open STM32CubeIDE
2. `File → New → STM32 Project`
3. In the Board Selector, search for **STM32F429I-DISC1** in Commercial Part Number (your exact chip)
4. Click on the uploaded board item on the bottom of the right window, and click Next
5. Give it a name like `uart_bare_metal`
6. **THIS IS IMPORTANT**: Under **"Targeted Project Type"** — select **`Empty`**, not STM32Cube. Leave everything as it is. Click Finish

This is the key difference. Selecting `Empty` gives you a minimal project without HAL, without CubeMX, without generated code. There is just the startup file, linker script, and a blank `main.c`.
Once created, a project structure should be like:

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

![[empty-project-file-structure1.png]]

However, this is not enough. If you build the project only with the default files, it will return many errors.
Although it is a bare-metal project, it still needs software support from STM and CMSIS headers.

![[empty-project-file-structure2.png | 500]]

{% include figure.liquid
   loading="eager"
   path="/assets/post-attachments/2026-02-28/empty-project-file-structure2.png"
   class="img-fluid rounded z-depth-1" width="500px"
   %}

Here are the headers that must be inserted under `Inc` folder. The easiest way to create these files is to just copy and paste them from an existing project (any project that is created with STM32Cube configuration, not Empty).

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

And a source file `system_stm32f4xx.c`, that configures the system clock (HCLK), sets up flash memory latency, and initializes the microcontroller after reset:

```
Src
├── system_stm32f4xx.c
```

### 3.1 What's the Purpose of Startup File (`startup_stm32f429zitx.s`)?

Startup file prepares C runtime environment before `main()`. There is common misconception here — the startup file does NOT initialize peripherals or clocks.

**What it actually does (in order):**

1. Sets up the **stack pointer**
2. Calls `SystemInit()` (minimal clock setup, runs before `main()`)
3. Copies **initialized global variables** from flash to RAM
4. **Zero-fills the BSS segment** (uninitialized globals)
5. Calls **static constructors**
6. Calls **`main()`**

The peripheral and clock initialization is programmer's responsibility to fill inside `main()`.

### 3.2 Linker Script (`STM32F429ZITX_FLASH.ld`)

The linker script tells the linker **where to place code, data, and stack in memory**.  
Two linker scripts exist:

- `FLASH.ld` — normal use, code lives permanently in flash -> Use this
- `RAM.ld` — loads code entirely into RAM (faster debug, not standard)

### 3.3. Sidenote

**`syscalls.c` and `sysmem.c`** are minimal C runtime stubs. They provide bare-bones implementations of system calls like `_write()` and `_sbrk()` that the C standard library expects to exist.

**Two linker scripts**: `FLASH.ld` and `RAM.ld`. FLASH is the normal configuration where code lives permanently in flash memory. RAM.ld is for loading code entirely into RAM (useful for faster debug cycles, but not what we want here).

---

**Key reference documents:**

- RM0090 — STM32F429 Reference Manual (main register reference)
- UM1670 — STM32F429I-DISC1 User Manual (board-level details)
- STM32F429 Datasheet — Table 11 (alternate function mapping), Table 12 (pin definitions)

[^1]: p.270, 8.3. GPIO functional description, RM0090 Reference Manual

[^2]: p.276, Figure 27. Selecting an alternate function on STM32F42xxx and STM32F43xxx, RM0090 Reference Manual

[^3]: p.15, 6.3.3. VCP Configuration, UM1670

[^4]: p.22, Table 7. STM32 pin description versus board functions, UM1670
