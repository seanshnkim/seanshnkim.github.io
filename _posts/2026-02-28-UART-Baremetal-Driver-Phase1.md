---
layout: post
title: "UART Bare-Metal Driver Phase 1: Clock Init and GPIO Configuration"
date: 2026-02-28 22:45:47
categories: Firmware
toc: '{"beginning":true,"sidebar":"left"}'
---

## 1. Setting up Driver is setting up registers

90% of building an UART driver task is **setting up registers**.

- RCC (Reset and Clock Control) — specifically the APB1/APB2 peripheral clock enable registers
- GPIO — the MODER, AFRL/AFRH registers
- USART — the CR1, CR2, BRR registers

{% include figure.liquid
   loading="eager"
   path="/assets/post-attachments/2026-02-28/diagram-registers.jpeg"
   class="img-fluid rounded z-depth-1" width="500px"
   %}

![[diagram-registers.jpeg | 500]]

### Code Template

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

Now looking back on the project, initializing UART task can be simplified into setting up each proper register values.
Now the question is: where should I find the answer from?
Every answer is in a datasheet, and that's why bare-metal project requires reading datasheet skills.

### Side Note: Register Bit Manipulation Pattern

**Never use `=` to write a peripheral register**. It clears all other bits.
Always use the **clear-then-set** pattern:

```c
// 1. Clear only the target bits
REGISTER &= ~(MASK << POSITION);

// 2. Set target bits to desired value
REGISTER |=  (VALUE << POSITION);
```

## 2. The Clock

For the UART driver, the very first thing to enable is the **clock signal to the peripheral.**
Every peripheral is **off by default**. Without a clock signal, the device is completely inert, so writing registers does nothing.

On STM32, this is controlled by the **RCC (Reset and Clock Control)** registers. Specifically,

- USART1 lives on the APB2 bus → you enable it via `RCC->APB2ENR`
- PA9/PA10 are on GPIO Port A → you enable it via `RCC->AHB1ENR`

In p.190 of Datasheet UM0090, RCC APB2 peripheral clock enable register (RCC_APB2ENR):

```
Bit 4 USART1EN: USART1 clock enable
This bit is set and cleared by software.
0: USART1 clock disabled
1: USART1 clock enabled
```

Therefore, if it is translated into code:

```c
void uart_init(void)
{
    // Step 1: Enable clocks
    RCC->AHB1ENR |= (1 << 0);   // Enable GPIOA clock
    RCC->APB2ENR |= (1 << 4);   // Enable USART1 clock
```

Or using CMSIS definitions `RCC_AHB1ENR_GPIOAEN` or `RCC_APB2ENR_USART1EN`, which are provided by `stm32f429xx.h`:

```c
void uart_init(void)
{
    // Step 1: Enable clocks
    RCC->AHB1ENR |= RCC_AHB1ENR_GPIOAEN;    // Enable GPIOA clock
    RCC->APB2ENR |= RCC_APB2ENR_USART1EN;   // Enable USART1 clock
```

Clock register initialization must be done BEFORE touching any peripheral register — GPIO or USART register.

### 2.1. Why are GPIOA and USART1 on different buses?

- **AHB** stands for **Advanced High Performance Bus**, a high-speed bus designed for high-bandwidth components (CPU, DMA, Memory).
- **APB** stands for **Advanced Peripheral Bus**. **AHB** is , a lower-speed, low-power bus designed for peripherals that don't need high data rates (UART, Timers, I2C).
- GPIOs sit on AHB1 because they need fast response times. USART1 doesn't need that speed so it lives on APB2.

## 3. GPIO Mode Configuration

Next step is to set GPIO MODER registers. Before jumping into GPIO register configuration, we need to know "GPIO mode".

GPIO pins on STM32 have four possible modes:

- Input
- Output
- **Alternate Function**
- Analog

Let's look at p.270 of Datasheet RM0090:

{% include figure.liquid
   loading="eager"
   path="/assets/post-attachments/2026-02-28/GPIO-functional-description.png"
   class="img-fluid rounded z-depth-1" width="750px"
   %}
[^1]

![[GPIO-functional-description.png | 750]]

### 3.1. What Is Alternate Function?

It is like telling a pin (say PA9) to redirect: "You belong to USART1 now, not GPIO." In other words, it configures General-Purpose Input/Output (GPIO) pins to be controlled by internal peripherals rather than as general-purpose I/O.

```
    		   ┌─── TIM1_CH2
               ├─── I2C3_SMBA
Physical Pin  ─┤─── USART1_TX   ← you select this
               ├─── DCMI_D0
               └─── EVENTOUT
```

A pin on a microcontroller is a **physical wire** coming out of the chip. But inside the chip, multiple peripherals might want to use that same wire. The alternate function system is essentially a **multiplexer**. It's a hardware switch that connects the physical pin to one internal peripheral at a time. So if I select AF7 (which is for USART1), it will be like closing the hardware switch that connects the pin to USART1's TX line.

### 3.2. Finding the Right Pins and AF Number

Since an user can select which one via the AF number (AF0–AF15) in the `AFRH`/`AFRL` registers, we need to know which AF number to select for USART1.
Let's go back to the datasheets RM0090 and UM1670 carefully, and answer the following questions:

1. What is the pin for USART1 Transmit (USART1_TX) in STM32F429?
2. What is the pin for USART1 Receive (USART1_RX) in STM32F429?

-> The answer is in UM1670 Datasheet, p.22:

{% include figure.liquid
   loading="eager"
   path="/assets/post-attachments/2026-02-28/USART-pins.jpeg"
   class="img-fluid rounded z-depth-1" width="500px"
   %}[^4]

![[USART-pins.jpg | 500]]

So we found out that the pins for USART1 is PA9 and PA10:

- PA9 → USART1_TX
- PA10 → USART1_RX

Then the next question is: **What is the alternate function pin for USART1?**
Again, the answer is Datasheet RM0090: For USART1, the alternate function pin is **AF7**.

{% include figure.liquid
   loading="eager"
   path="/assets/post-attachments/2026-02-28/Alternate-Function-STM32F42xxx.jpeg"
   class="img-fluid rounded z-depth-1" width="750px"
   %}[^2]

![[Alternate-Function-STM32F42xxx.jpg]]

### 3.3. How to Implement in Code?

In p.284 of Datasheet RM0090:

{% include figure.liquid
   loading="eager"
   path="/assets/post-attachments/2026-02-28/GPIO_MODER-bits.png"
   class="img-fluid rounded z-depth-1" width="750px"
   %}

![[GPIO_MODER-bits.png | 750]]

It says:

```
Bits 2y:2y+1 MODERy[1:0]: Port x configuration bits (y = 0..15)
These bits are written by software to configure the I/O direction mode.

00: Input (reset state)
01: General purpose output mode
10: Alternate function mode  ← we will select this for UART
11: Analog mode
```

The GPIO mode can be configured in GPIO port mode register `GPIOx_MODER`, 2 bits per pin. There are 16 bit fields named **MODER0, MODER1... MODER15**, each bit field having 2 bits (total 32 bits = one register).

To summarize, each pin gets **2 bits** in the MODER register. For PA9 and PA10,

- PA9 is controlled by bits **19:18** (2×9+1 : 2×9)
- PA10 is controlled by bits **21:20** (2×10+1 : 2×10)

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

Breaking that down:

- `0x3` is `11` in binary — a 2-bit mask.
- `<< 18` shifts it to the PA9 position (bits 19:18)
- `~` is bitwise NOT operator, which inverts all bits (0 to 1, 1 to 0). So you get all 1s except bits 19:18
- `&=` clears only those two bits, leaving everything else untouched

### 3.4. Side Note: GPIO Port vs Pin (x vs y)

- **x = Port** (e.g., A, B, C...) is a separate hardware block managing 16 pins.
  - `GPIOA`, `GPIOB` are at different memory addresses
- **y = Pin number within that port** (0–15)  
  → PA9 = Port A, Pin 9

## 4. GPIO AF Number Assignment

Setting GPIO's MODER to `10` only says _"this pin is now alternate function mode"_. It doesn't still tell **which** alternate function PA9 and PA10 are mapped to. And that is done through a separate register called **AFRL or AFRH** (Alternate Function Low/High registers).

We set `GPIOA->MODER |=  (0x2 << 18);`, meaning "PA9 wants to be connected to a peripheral".
But what peripheral? That will be handled by this line of code: `GPIOA->AFR[1] |=  (0x7 << 4);` which sets

Then what's the difference between AFRH and AFRL?

- **AFRL**, "Low", handles PA0–PA7.
- **AFRH**, "High", handles PA8–PA15

Each pin takes 4 bits both in AFRH and AFRL. But as you can see, we will only be using AFRH (`GPIOA->AFR[1]`). The bit positions for PA9 and PA10 are:

- PA9 → bits **7:4** in AFRH (pin 9 − 8 = position 1, × 4 = bit 4)
- PA10 → bits **11:8** in AFRH (pin 10 − 8 = position 2, × 4 = bit 8)

Each pin gets **4 bits** in the AFR register, allowing values AF0–AF15.

### 4.1. What does `x` and `y` mean in `GPIOx_AFRHy`?

- x = port (A/B/C...)
- y = pin number within that port (0–15)

### 4.2. AFRH Register (GPIOx_AFRH)

Now I believe you started to catch on the patterns of reading registers and assigning bits. For that reason, I'll keep it brief for this part.

- Controls pins 8–15 of a port (AFRL controls pins 0–7)
- Each pin occupies **4 bits** → allows AF0–AF15
- Register: `GPIOA->AFR[1]` (index 1 = AFRH)
- Bit position formula: **(pin − 8) × 4**
  - PA9 → (9−8) × 4 = bit **4**
  - PA10 → (10−8) × 4 = bit **8**

![[GPIOx_AFRH.jpg]]

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

---

## 5. Code Written So Far (RCC, GPIO Mode and )

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

## 6. Full Initialization Sequence (Planned)

```
Step 1: Enable clocks       → RCC->AHB1ENR (GPIOA), RCC->APB2ENR (USART1)
Step 2: Configure pins      → PA9, PA10 to Alternate Function mode (MODER = 10)
Step 3: Assign AF number    → AF7 for both pins (AFRH)        ← DONE UP TO HERE
Step 4: Configure USART1    → BRR (baud rate), word length, stop bits, parity,
                               enable TX/RX, enable RXNE interrupt, enable UE bit
Step 5: Configure NVIC      → NVIC_EnableIRQ(USART1_IRQn), set priority
Step 6: Write ISR           → USART1_IRQHandler()
```

Next step will be USART1 peripheral configuration. Before heading to Phase 2, try looking into **RM0090 Section 30.6.3 — Fractional baud rate generation** and answer the following questions:

- What clock frequency does APB2 run at by default after reset on STM32F429?
- How to calculate the BRR value from that frequency
- Which bits in CR1 to set for: word length, TX enable, RX enable, RXNE interrupt, UE (USART enable)

[^1]: p.270, 8.3. GPIO functional description, RM0090 Reference Manual

[^2]: p.276, Figure 27. Selecting an alternate function on STM32F42xxx and STM32F43xxx, RM0090 Reference Manual

[^3]: p.15, 6.3.3. VCP Configuration, UM1670

[^4]: p.22, Table 7. STM32 pin description versus board functions, UM1670
