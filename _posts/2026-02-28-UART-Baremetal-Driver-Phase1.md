---
layout: post
title: "UART Bare-Metal Driver Phase 1: Clock Init and GPIO Configuration"
date: 2026-02-28 22:45:47
categories: Firmware
toc: '{"beginning":true,"sidebar":"left"}'
---

## Phase 1 Roadmap: From Clock, GPIO, to Alternate Function

```
========== PHASE 1 ==========
1. Enable clocks    → RCC->AHB1ENR  (GPIOA)
                    → RCC->APB2ENR  (USART1)

2. Configure pins   → PA9, PA10 to Alternate Function mode
                    → Set AF7 for both pins
```

In this phase, we will work on three steps:

1. First, wake up the clock. It's as if breathing life into a peripheral, giving it a heartbeat. By configuring a register called RCC (Reset and Clock Control), we enable the peripheral clock.
2. Next, configure GPIO pin mode. We'll switch a GPIO pin away from its default role (Input/Output) into a "something else" mode. This "something else" is called **Alternate Function Mode** in STM32.
3. Lastly, choose alternate function number. The previous step naturally raises an obvious question: _which specific function should it take up_? We configure the Alternate Function number to match USART1, so the GPIO pin can carry out USART communication.

Although it sounds simple, each step involves continuous back-and-forth with datasheets and register-level verification. Buckle up, and let's get into it.

## 1. Setting Up a Driver Is Setting Up Registers

Here's a blunt truth: 90% of initializing a UART driver from scratch is just configuring registers.
What we need here is persistence to read through datasheets to find the right registers.
We will be setting up three types of registers for UART:

- **RCC** (Reset and Clock Control) — specifically the APB1/APB2 peripheral clock enable registers
- **GPIO** — the MODER, AFRL/AFRH registers
- **USART** — the CR1, CR2, BRR registers

{% include figure.liquid
   loading="eager"
   path="/assets/post-attachments/2026-02-28/diagram-registers.jpeg"
   class="img-fluid rounded z-depth-1" width="500px"
   %}

### UART Initialization Code Template

At a high level, initializing UART looks like this:

```c
void uart_init(void)
{
    // Step 1: Enable clocks
    RCC->AHB1ENR ...
    RCC->APB2ENR ...

    // Step 2: Configure PA9, PA10 as Alternate Function mode
    // PA9 → bits 19:18 in MODER
    GPIOA->MODER ...
    GPIOA->MODER ...

    // PA10 → bits 21:20 in MODER
    GPIOA->MODER ...
    GPIOA->MODER ...

    // Step 3: Assign AF7 (USART1) to PA9 and PA10 via AFRH
    // PA9 → bits 7:4 in AFRH
    GPIOA->AFR[1] ...
    GPIOA->AFR[1] ...

    // PA10 → bits 11:8 in AFRH
    GPIOA->AFR[1] ...
    GPIOA->AFR[1] ...
}
```

Every line comes down to answering one question: "_What does the datasheet say goes here?_" That's the core skill of bare-metal programming: reading documentation carefully and translating it faithfully.

---

## 2. The Clock: Wake Up the Peripheral First

Before touching any peripheral register, you must do one thing: **enable its clock.**

Every peripheral on an STM32 is **off by default**. Peripherals need clock signal to work; without a clock signal, the peripheral is completely inert. Writing to its registers does nothing, or worse, produces undefined behavior.

On STM32, clock gating is controlled by the **RCC (Reset and Clock Control)** registers:

- **USART1** lives on the APB2 bus → enable via `RCC->APB2ENR`
- **PA9/PA10** are on GPIO Port A → enable via `RCC->AHB1ENR`

From p.190 of RM0090:

```
Bit 4 USART1EN: USART1 clock enable
// This bit is set and cleared by software.
0: USART1 clock disabled
1: USART1 clock enabled
```

Translated into code:

```c
void uart_init(void)
{
    // Step 1: Enable clocks
    RCC->AHB1ENR |= (1 << 0);   // Enable GPIOA clock
    RCC->APB2ENR |= (1 << 4);   // Enable USART1 clock
```

Or, we can use more readable names — CMSIS macros from `stm32f429xx.h`:

```c
void uart_init(void)
{
    // Step 1: Enable clocks
    RCC->AHB1ENR |= RCC_AHB1ENR_GPIOAEN;    // Enable GPIOA clock
    RCC->APB2ENR |= RCC_APB2ENR_USART1EN;   // Enable USART1 clock
```

**Order matters.** Clock initialization must happen **before** touching any GPIO or USART register. This is one of the most common mistakes in bare-metal bringup.

### 2.1. Why Are GPIOA and USART1 on Different Buses?

This is a question worth pausing on.

- **AHB** stands for **Advanced High Performance Bus**, a high-speed bus for high-bandwidth components: CPU, DMA controllers, and flash memory. Also where **GPIO**s live, because they need fast response times.
- **APB** stands for **Advanced Peripheral Bus**. **AHB** is a lower-speed, lower-power bus for peripherals that don't require high data rates: UART, Timers, I2C.

USART1 is on APB2 rather than AHB because a serial communication peripheral topping out at a few megabits per second simply doesn't need a high-speed bus. Putting it on APB keeps power consumption down.

---

## 3. GPIO Mode Configuration

With clocks enabled, the next step is configuring the **GPIO mode** for PA9 and PA10.
Each GPIO pin on an STM32 can operate in one of four modes:

| Mode                   | Value | Use case                                     |
| ---------------------- | ----- | -------------------------------------------- |
| Input                  | `00`  | Reading button presses, digital signals      |
| Output                 | `01`  | Driving LEDs, digital outputs                |
| **Alternate Function** | `10`  | **Hardware peripherals (UART, SPI, I2C...)** |
| Analog                 | `11`  | ADC/DAC signals                              |

For UART, we need **Alternate Function mode**.

{% include figure.liquid
   loading="eager"
   path="/assets/post-attachments/2026-02-28/GPIO-functional-description.png"
   class="img-fluid rounded z-depth-1" width="750px"
   %}
[^1]

### 3.1. What Is Alternate Function Mode?

Setting to Alternate Function mode is like telling a pin (say PA9) to redirect: "You belong to USART1 now, not GPIO." It configures General-Purpose Input/Output (GPIO) pins to be controlled by internal peripherals rather than as general-purpose I/O.

Think of the alternate function system as essentially a **multiplexer**. It's a hardware switch that connects the physical pin to one internal peripheral at a time. It will be like closing the hardware switch that connects the pin to USART1's TX line.

```
    		   ┌─── TIM1_CH2
               ├─── I2C3_SMBA
Physical Pin  ─┤─── USART1_TX   ← you select this
               ├─── DCMI_D0
               └─── EVENTOUT
```

### 3.2. Finding the Right Pins and AF Number

There are AF numbers (AF0–AF15) in the `AFRH`/`AFRL` registers, and we need to select one of them for USART1. Two things to figure out from the datasheets RM0090 and UM1670:

1. What are the pins for USART1 Transmit (USART1_TX) and Receive (USART1_RX) in STM32F429?
2. Which AF number corresponds to USART1?

The answer is in UM1670, p.22:

{% include figure.liquid
   loading="eager"
   path="/assets/post-attachments/2026-02-28/USART-pins.jpeg"
   class="img-fluid rounded z-depth-1" width="500px"
   %}[^4]

Then the next question is: **What is the alternate function pin for USART1?**
This time, the answer is in the different datasheet: RM0090.

{% include figure.liquid
   loading="eager"
   path="/assets/post-attachments/2026-02-28/Alternate-Function-STM32F42xxx.jpeg"
   class="img-fluid rounded z-depth-1" width="750px"
   %}[^2]

To wrap up:

- USART1 -> AF7
- PA9 → USART1_TX
- PA10 → USART1_RX

### 3.3. Implementing GPIO Mode in Code

From p.284 of RM0090, the `GPIOx_MODER` register assigns **2 bits per pin**:

```
00: Input
01: General purpose output
10: Alternate function mode  ← this is what we want
11: Analog mode
```

{% include figure.liquid
   loading="eager"
   path="/assets/post-attachments/2026-02-28/GPIO_MODER-bits.png"
   class="img-fluid rounded z-depth-1" width="750px"
   %}

The datasheet says:

```
Bits 2y:2y+1 MODERy[1:0]: Port x configuration bits (y = 0..15)
These bits are written by software to configure the I/O direction mode.

00: Input (reset state)
01: General purpose output mode
10: Alternate function mode  ← we will select this for UART
11: Analog mode
```

There are 16 bit-fields named **MODER0, MODER1... MODER15**, each field having 2 bits (total 16\*2 = 32 bits → one 32-bit register).
For PA9 and PA10:

- PA9 → bits **19:18** (formula: 2×9+1 : 2×9)
- PA10 → bits **21:20** (formula: 2×10+1 : 2×10)

The GPIO mode can be configured in GPIO port mode register `GPIOx_MODER`, 2 bits per pin.

Translated into code:

```c
void uart_init(void)
{
	...
    // Step 2: Configure PA9, PA10 as Alternate Function mode
    // PA9 → bits 19:18 in MODER
    GPIOA->MODER &= ~(0x3 << 18);  // clear
    GPIOA->MODER |=  (0x2 << 18);  // set AF mode (10)
    // PA10 → bits 21:20 in MODER
    GPIOA->MODER &= ~(0x3 << 20);  // clear
    GPIOA->MODER |=  (0x2 << 20);  // set AF mode (10)
```

Shown in image:

{% include figure.liquid
   loading="eager"
   path="/assets/post-attachments/2026-02-28/GPIO_MODER-bits_PA9PA10.jpeg"
   class="img-fluid rounded z-depth-1" width="750px"
   %}

Breaking down the first line:

- `0x3` is `11` in binary — a 2-bit mask
- `<< 18` shifts it into the PA9 position (bits 19:18)
- `~` is a bitwise NOT operator, which inverts all bits (0 → 1, 1 → 0). Inverting the bits return all 1s except at bits 19:18
- `&=` clears only those two bits, leaving every other bit untouched

### The Caveat of Register Bit Manipulation

**Do not use `'='` operator to write a peripheral register**. It wipes every other bit in that registers, potentially disabling things you hadn't touched yet. Instead, always use the **clear-then-set** pattern:

```c
// 1. Clear only the target bits
REGISTER &= ~(MASK << POSITION);

// 2. Set target bits to desired value
REGISTER |=  (VALUE << POSITION);
```

### 3.4. Side Note: GPIO Port vs Pin (x vs y)

This notation shows up constantly in STM32 documentation:

- **x = Port** (A, B, C...) is a separate hardware block each at a distinct memory address (`GPIOA`, `GPIOB`, etc.)
  - `GPIOA`, `GPIOB` are at different memory addresses
- **y = Pin number within that port** (0–15)
  - → PA9 = Port A, Pin 9

So PA9 means Port A, Pin 9. `GPIOx_MODER` with x=A and y=9.

---

## 4. Assigning the Alternate Function Number

{% include figure.liquid
   loading="eager"
   path="/assets/post-attachments/2026-02-28/AF-number-json-widget.png"
   class="img-fluid rounded z-depth-1" width="750px"
   %}

Setting GPIO's MODER to `10` only tells the hardware: _"This pin will be driven by a peripheral"_. But it doesn't yet say **which** alternate function PA9 and PA10 are mapped to. In other words, the hardware still doesn't know if Pin 9 and Pin 10 are wired to TIM (timer), SPI, CAN, Ethernet (ETH), or USART. Separate registers called **AFRL** and **AFRH** (Alternate Function Low/High registers) take care of this function mapping.
This is a crucial step in configuring microcontroller peripherals for communication and timing.

Setting a GPIO mode and choosing its alternate function number defines how the peripheral connects to the physical pins. To explain this clearly, I've created a simpler, academic-style diagram that breaks down the configuration steps and visualizes how a specific alternate function (AF7) is routed to make the pins operate as a USART.

There are two registers:

- **AFRL** (`AFR[0]`) — handles pins 0–7 ("AF Register Low")
- **AFRH** (`AFR[1]`) — handles pins 8–15 (AF Register High")

We set `GPIOA->MODER |=  (0x2 << 18);`, meaning "PA9 wants to be connected to a peripheral".
Each pin takes 4 bits both in AFRH and AFRL. But as you can see, Pin 9 (PA9) and Pin 10 (PA10) are handled only by AFRH (`GPIOA->AFR[1]`). Thus, the bit positions for PA9 and PA10 are:

- PA9 → 4 bits in **7:4** of AFRH (How? pin 9 − 8 = position 1, × 4 = bit 4)
- PA10 → 4 bits in **11:8** of AFRH (pin 10 − 8 = position 2, × 4 = bit 8)

### 4.1. What does `x` and `y` mean in `GPIOx_AFRHy`?

- x = port (A/B/C...)
- y = pin number within that port (0–15)

### 4.2. AFRH Register (GPIOx_AFRH)

I assume readers now probably start catching on the patterns of reading registers and assigning bits. For that reason, I'll keep it brief for AFRH register.

- Controls pins 8–15 of a port (AFRL controls pins 0–7)
- Each pin occupies **4 bits** → allows AF0–AF15
- Register: `GPIOA->AFR[1]` (index 1 = AFRH)
- Bit position formula: **(pin − 8) × 4**
  - PA9 → (9−8) × 4 = bit **4**
  - PA10 → (10−8) × 4 = bit **8**

{% include figure.liquid
   loading="eager"
   path="/assets/post-attachments/2026-02-28/GPIOx_AFRH.jpeg"
   class="img-fluid rounded z-depth-1" width="750px"
   %}

```c
void uart_init(void)
{
	...
    // Step 3: Assign AF7 (USART1) to PA9 and PA10 via AFRH
    // PA9 → bits 7:4 in AFRH
    GPIOA->AFR[1] &= ~(0xF << 4);  // clear
    GPIOA->AFR[1] |=  (0x7 << 4);  // AF7
    // PA10 → bits 11:8 in AFRH
    GPIOA->AFR[1] &= ~(0xF << 8);  // clear
    GPIOA->AFR[1] |=  (0x7 << 8);  // AF7
```

Notice the same clear-then-set pattern, but now with a 4-bit mask (`0xF`) instead of the 2-bit one (`0x3`) we used in MODER.

---

## 5. Full Code So Far (RCC, GPIO Mode, and Alternate Function)

```c
void uart_init(void)
{
    // Step 1: Enable clocks
    RCC->AHB1ENR |= RCC_AHB1ENR_GPIOAEN;    // Enable GPIOA clock
    RCC->APB2ENR |= RCC_APB2ENR_USART1EN;   // Enable USART1 clock

    // Step 2: Configure PA9, PA10 as Alternate Function mode
    // PA9 → bits 19:18 in MODER
    GPIOA->MODER &= ~(0x3 << 18);  // clear
    GPIOA->MODER |=  (0x2 << 18);  // set AF mode (10)
    // PA10 → bits 21:20 in MODER
    GPIOA->MODER &= ~(0x3 << 20);  // clear
    GPIOA->MODER |=  (0x2 << 20);  // set AF mode (10)

    // Step 3: Assign AF7 (USART1) to PA9 and PA10 via AFRH
    // PA9 → bits 7:4 in AFRH
    GPIOA->AFR[1] &= ~(0xF << 4);  // clear
    GPIOA->AFR[1] |=  (0x7 << 4);  // AF7
    // PA10 → bits 11:8 in AFRH
    GPIOA->AFR[1] &= ~(0xF << 8);  // clear
    GPIOA->AFR[1] |=  (0x7 << 8);  // AF7
}
```

## 6. What's Next: The Full Initialization Sequence

Before Phase 2, it's worth doing a little pre-reading. Open **RM0090 Section 30.6.3 — Fractional baud rate generation** and try to answer these questions.

- What clock frequency does APB2 run at by default after reset on STM32F429?
- How do you calculate the BRR value from that frequency?
- Which bits in CR1 control word length, TX enable, RX enable, RXNE interrupt, and UE (USART enable)?

Having those answers before reading the next post will make Phase 2 significantly easier to follow.

---

[^1]: p.270, 8.3. GPIO functional description, RM0090 Reference Manual

[^2]: p.276, Figure 27. Selecting an alternate function on STM32F42xxx and STM32F43xxx, RM0090 Reference Manual

[^3]: p.15, 6.3.3. VCP Configuration, UM1670

[^4]: p.22, Table 7. STM32 pin description versus board functions, UM1670
