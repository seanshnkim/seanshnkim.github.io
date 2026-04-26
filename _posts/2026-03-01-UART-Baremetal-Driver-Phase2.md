---
layout: post
title: "UART Bare-Metal Driver Phase 2: Baud Rate and Control Registers"
date: 2026-03-01 12:41:50
categories: Firmware
toc:
  beginning: true
  sidebar: left
---

## Phase 2 Roadmap: Set Baud Rate and UART Control Registers

```
========== PHASE 2 ==========
3. Configure USART1 → Set BRR (baud rate)
                    → Set stop bits, parity
                    → Enable TX/RX (Transmit and Receive)
                    → Enable RXNE interrupt
                    → Enable USART1 (UE bit)
```

In this phase, we will configure UART in more detail.
1. **Baud Rate**: Unlike SPI or I2C, which have a dedicated clock signal that both sides share, UART doesn't have a clock that synchronizes the sender and receiver. But both sides still have to agree in advance on a rhythm: "we'll each independently tick at exactly X times per second, and trust each other to stay in sync." That is what baud rate is for. We will set our baud rate via the Baud Rate Register (`BRR`).
2. **USART control register**: USART control register `USART_CR1` handles nearly every aspect of USART communication setup. Specifically, it controls four things:
	1. Should we enable the transmitter? (TE = Transmit Enable)
	2. Should we enable the receiver? (RE = Receiver Enable)
	3. Should we enable an interrupt when a received byte is ready to be read? (RXNEIE = Receive Not Empty Interrupt Enable)
	4. Should we enable an interrupt when the Transmit Data Register is empty? (TXEIE = Transmit Data Register Empty Interrupt Enable)

If Phase 1 was about wiring things up (clock setup, routing signals to the right pins), Phase 2 is about telling USART1 how fast to do, and what to do it.

## 1. What is Baud Rate? And Where Is It Stored?

I know I have already explained the concept a bit, but let me explain it once again (because it's that important!)
Baud rate determines the speed of serial data transmission. UART is an asynchronous communication protocol, where the transmitter and receiver don't have a shared clock signal. Therefore, a programmer must define the speed (bits per second) at which data it will transfer so that the transmitter and receiver can synchronize.

{% include figure.liquid loading="eager" path="/assets/post-attachments/2026-03-01/baud-rate.jpeg" class="img-fluid rounded z-depth-1" width="750px" %}

For UART, common standard baud rates are 9600 (low speed) and 115200 (high speed). Baud Rate Register (BRR) stores a divisor value (we will later explain it as "USARTDIV") that, when combined with the system clock, sets the baud rate. So it comes to one conclusion: where do we find that divisor value, and to which value should we set?


### 1.1. The Baud Rate Formula
The answer is always in datasheet. In p.981 of RM0090, Section 30.3.4: Fractional baud rate generation:

{% include figure.liquid loading="eager" path="/assets/post-attachments/2026-03-01/baud-rate-generation.png" class="img-fluid rounded z-depth-1" width="750px" %}

$$
\text{Tx/Rx baud} = \frac{f_{CK}}{8\times(2-\text{OVER8})\times\text{USARTDIV}}
$$

We have the formula. You should ask these following questions:
1. What is $f_{CK}$?
2. What is $OVER8$ value?
3. What is $USARTDIV$?

### 1.2. fCK: Peripheral Clock Frequency
$f_{CK}$ stands for peripheral clock frequency. I want to emphasize that *$f_{CK}$ is NOT equal to the system clock frequency*.

In this project, peripheral clock happens to be equal to system clock. This is because we supposed that APB2 prescaler never changes from 1 (default value). However, this is not always the case in real scenarios. If you want to run peripherals slower so to reduce power consumption, then set prescaler to 2 or 4 so that peripherals have slower clock. Or if a peripheral bus like APB1 on STM32F4 has a 42MHz max, but SYSCLK is 168MHz, you must set prescaler to 4.

$f_{CK}$ is not a system clock frequency, but a (UART) peripheral frequency. For STM32F4, USART1 sits on APB2, so it's technically APB2 clock frequency.

### 1.3. OVER8: Oversampling Bit (by 16 vs. by 8)
OVER8 dictates how many samples per bit period. 
- If OVER8 = 0, oversample by 16. 
- If OVER8 = 1, oversample by 8.
The most common approach is sampling 16 times per bit period. Bit period is equal to $\frac{1}{\text{Baud Rate}} sec$ .

Then why do we oversample? This is because the actual signal is full of noise. By oversampling (sampling more than once per bit period), the receiver can look for a consistent value over multiple samples. Also multiple samples enable data recovery by discriminating between valid incoming data and noise. (Section 30.3 USART functional description, p.969) 


{% include figure.liquid loading="eager" path="/assets/post-attachments/2026-03-01/noisy-signal.png" class="img-fluid rounded z-depth-1" width="500px" %}

In RM0090, it provides the majority vote of the three samples in the center of the received bit (p.979). However, I honestly do not know if the same rule is applied through different types of microcontrollers.

{% include figure.liquid loading="eager" path="/assets/post-attachments/2026-03-01/data-oversampling_labeled.png" class="img-fluid rounded z-depth-1" width="750px" %}

| OVER8 | Mode               | Fractional bits | Use case                        |
| ----- | ------------------ | --------------- | ------------------------------- |
| 0     | Oversampling by 16 | 4 bits (0–15)   | Default, safe at standard bauds |
| 1     | Oversampling by 8  | 3 bits (0–7)    | Higher speeds, tighter margins  |

### 1.4. USARTDIV, Divisor For Baud Rate Formula

USARTDIV is described as:

> USARTDIV is a fixed-point unsigned integer used in STM32 microcontrollers to calculate the baud rate of the USART/UART serial peripheral, stored in the USART_BRR register. It sets the ratio between the peripheral clock and the desired baud rate by dividing the clock and often using fractional division for accuracy. (Google AI Overview)

But I think this description makes rather confusing. The better way to explain it is to simply say "a divisor number to fit into the baud rate formula". Let's look at the formula again:

$$
\text{Tx/Rx baud} = \frac{f_{CK}}{8\times(2-\text{OVER8})\times\text{USARTDIV}}
$$

Suppose we want to set up a baud rate = 9600, and we already fix the desired peripheral clock and oversampling rate.

- $f_{CK} = 16MHz$
- $\text{OVER8} = 0$ (oversampling by 16)
- baud rate = 9600

Then the formula looks like:

$$
\text{baud rate} = \frac{f_{CK}}{8\times(2-\text{OVER8})\times\text{USARTDIV}} = \frac{16\times10^6}{8 \times 2 \times \text{USARTDIV}} = 9600
$$

We can derive $\text{USARTDIV}$ value from above:

$$
\text{USARTDIV} = \frac{16\times10^6}{8 \times 2 \times 9600} = 104.1666...
$$

USARTDIV is mostly a fractional number, so it is divided into two parts (Mantissa and Fraction):

$$
USARTDIV = DIV_{Mantissa} + \frac{DIV_{Fraction}}{8\times{(2 - \text{OVER8})}}
$$

Sidenote: If you have trouble finding the formula above, it is written below Figure 296. USART block diagram, p.971 of RM0090.

Then why do we do all this hassle? Because USARTDIV is the value that is stored into the Baud Rate Register.

```c
// Step 4: Set baud rate — 9600 baud at 16 MHz peripheral clock, OVER8=0
USART1->BRR = ...;
```

## 2. Finding fCK: Peripheral Clock Frequency
But there’s something we’ve skipped over. In fact, fCK (the peripheral clock) hasn’t actually been defined yet. We just set fCK to 16 MHz in the example, but that was only an arbitrary value. The next question comes to: *What if we do not touch on anything, then how does our device (STM32F429) set peripheral clock by default?* Or starting from USART's perspective: *USART1 is on APB2. What clock frequency does APB2 run at on STM32F429 right after reset?*

### 2.1. Clock Tree of STM32F4
To understand how clock works in STM32, clock tree is the principal reference. Clock tree is like a map that tells you how all the clocks in STM32 device are configured. From clock signal sources (like HSI oscillators) to the CPU and peripheral clock, it tells how clock frequency is distributed to each type of clock.

This is the clock tree diagram of STM32F4 in RM0090 (Figure 16. Clock Tree, p.154):

{% include figure.liquid loading="eager" path="/assets/post-attachments/2026-03-01/clock-tree.jpeg" class="img-fluid rounded z-depth-1" width="750px" %}

Yes, it's a complicated figure. Good news is, we will only focus on this chain of clock to find out the APB2 clock frequency:

```
HSI ---> SYSCLK ---> AHB ---> APB2
                               ↑
                             ??? Hz
```


{% include figure.liquid loading="eager" path="/assets/post-attachments/2026-03-01/clock-tree-labeled.jpg" class="img-fluid rounded z-depth-1" width="750px" %}

To explain the full chain:

1. **HSI** feeds into the **SW (switch)** mux
2. The output of SW is **SYSCLK**
3. SYSCLK feeds into **AHB PRESC** (the AHB prescaler, /1, /2, ..512)
4. The output of AHB PRESC is **HCLK**, which also feeds into **APBx PRESC** (We don't use HCLK in this project! Ignore it)
5. The output of APBx PRESC is **APBx peripheral clocks* (USART1 is on APB2)

In Step 2, how do we know which one we are going to choose among the three options (HSI, HSE, PLLCLK) in switch mux?

Section 7.2.6 System clock (SYSCLK) selection (p.222) tells the answer: 

> After a system reset, the **HSI oscillator** is selected as the system clock.

```
HSI ---> SYSCLK ---> AHB ---> APB2
 ↑         ↑                   ↑
x MHz   x MHz               ??? Hz
```


### 2.2. HSI (High Speed Internal) Oscillator
Okay, so the question comes to: **what frequency does HSI run at?**
→ In STM32F429, the HSI clock is generated from an internal 16 MHz RC oscillator, so it runs at 16 MHz.

I won't describe the difference between internal vs. external clock resources or what each high speed or low speed (LSE, LSI) oscillator is for. For now, let's keep in mind that HSI works as a default starting point of clock signal (clock signal source).


```
HSI ---> SYSCLK ---> AHB ---> APB2
 ↑         ↑                   ↑
16 MHz   16 MHz               ??? Hz
```

### 2.3. AHB and APB2 Prescaler
A prescaler value divides a high-frequency input clock by an integer value (e.g., 2, 4, 8, ..., 256) to create a slower, lower-frequency signal for timers or peripherals.

1. Where is AHB prescaler value stored?
2. Where is APB prescaler stored?
3. What value are they each set to, right after reset?

 For the default prescaler value for AHB and APB2, we need to check the **RCC_CFGR register** (Section 7.3.3, p.230). 
 
 {% include figure.liquid loading="eager" path="/assets/post-attachments/2026-03-01/RCC_CFGR.png" class="img-fluid rounded z-depth-1" width="500px" %}

#### Illustration
Sometimes an illustration is worth a thousand words. 
First, RCC_CFGR register. It's a 32-bit register:

{% include figure.liquid loading="eager" path="/assets/post-attachments/2026-03-01/RCC_CFGR_1.jpg" class="img-fluid rounded z-depth-1" width="500px" %}

And its reset value is `0000 ... 0000`:

{% include figure.liquid loading="eager" path="/assets/post-attachments/2026-03-01/RCC_CFGR_2.jpg" class="img-fluid rounded z-depth-1" width="500px" %}

 The three bits `RCC_CFGR[15:13]` section is called **PPRE2**. PPRE2 refers to APB high-speed prescaler value. The RCC_CFGR register's reset value is `0x0000 0000`, so PPRE2 bits are also `PPR2[15:13]= 000`, meaning a prescaler of 1 (no division).
 
{% include figure.liquid loading="eager" path="/assets/post-attachments/2026-03-01/RCC_CFGR_3.jpg" class="img-fluid rounded z-depth-1" width="500px" %}

Same thing. It tells that AHB is not divided (divider is 1).

{% include figure.liquid loading="eager" path="/assets/post-attachments/2026-03-01/PPRE2_labeled.png" class="img-fluid rounded z-depth-1" width="500px" %}

Therefore, we complete the clock full chain:

```
HSI ---> SYSCLK ---> AHB ---> APB2
 ↑         ↑          ↑        ↑
                 (PRE = 1)  (PRE = 1)
16 MHz   16 MHz    16 MHz    16 MHz
```


### 2.4. The Clock Full Chain Summary

1. The HSI clock signal is generated from an internal 16MHz RC oscillator. **HSI runs at 16MHz frequency.**
2. After a system reset, the HSI oscillator is automatically selected as the system clock (SYSCLK).
3. The AHB and APB2 prescaler default values (reset value) are 1 — no divison.
4. From 3, SYSCLK frequency is the same as APB2 clock frequency.
5. Therefore, USART1's peripheral clock (fCK) = 16 MHz.


### 2.5. Caveat: It Only Works After Reset
This chain only describes the post-reset default on STM32F429. Once software touches the RCC registers, it may change AHB or APB prescaler values. Or if you're using a different type of device, it may have different frequency of HSI from 16MHz.


---

## 3. Deriving USARTDIV, the BRR Value

Ultimately $USARTDIV$ value is the BRR (Baud Rate Register) value.

```c
// BRR <- USARTDIV in binary
USART1->BRR = ...;
```

Now going back to the baud rate formula:

$$
\text{baud rate} = \frac{f_{CK}}{8\times(2-\text{OVER8})\times\text{USARTDIV}}
$$

- $f_{CK}$ = 16MHz
- $\text{OVER8}$ = 0 (16x oversampling)
- target baud rate = 9600 Hz

$$
\text{baud rate} = \frac{16\times10^6}{8 \times 2 \times \text{USARTDIV}} = 9600
$$

From the above we calculated $USARTDIV$ value:

$$
\text{USARTDIV} = \frac{16\times10^6}{8 \times 2 \times 9600} = 104.1666...
$$


Splitting into mantissa and fraction:

```
USARTDIV = DIV_Mantissa + (DIV_Fraction / 8 * (2 - OVER8) )
```

- Mantissa = 104 → binary `0000 0110 1000`
- Fraction = 0.1667 × 16 = 2.667 → rounded to 3 → binary `0011`

Combined: `0000 0110 1000 0011`, or `0x0683`

```c
// BRR <- USARTDIV in binary
USART1->BRR = 0x683;
```

**Verification:**

$$
\text{USARTDIV} = 104 + \frac{3}{16} = 104.1875
$$

$$
\text{Actual baud rate} = \frac{16,000,000}{(16 × 104.1875)} = 9,598.08
$$

$$
\text{error percentage (%)} = \frac{(9,600 - 9598.08)}{9,600} \times 100 = 0.0199
$$


The actual baud rate error is 0.02%. UART in STM32 typically tolerates up to 2% baud rate error (deviation) before we start seeing framing errors. 0.02% is well within the tolerance.


---

## 4. USART Control Register 1 (USART_CR1)

`CR1` is the main USART control register. This is where we enable TX (Transmit), RX (Receive), the RXNE (Received Not Enable) interrupt, and the USART itself (UE bit).

First, let's look at RM0090's Section 30.6.4 Control register 1 (USART_CR1), p.1013.

{% include figure.liquid loading="eager" path="/assets/post-attachments/2026-03-01/USART_CR1.png" class="img-fluid rounded z-depth-1" width="750px" %}

Except the Reserved bits (`CR1[31:16]`), we need to fill in 16 different bit fields with right values in CR1. 16 sounds quite a lot; but fortunately there are only five bit fields we need to change. All the remaining fields are unnecessary to be changed (unused, or kept at reset value).

### 4.1. CR1 Bit Fields to Be Changed

| Bit | Name   | Value                          | Reason                                           |
| --- | ------ | ------------------------------ | ------------------------------------------------ |
| 2   | RE     | 0 -> 1                         | Enable receiver                                  |
| 3   | TE     | 0 -> 1                         | Enable transmitter                               |
| 5   | RXNEIE | 0 -> 1                         | Enable interrupt when RX data register not empty |
| 7   | TXEIE  | 0 at init,<br>1 if only needed | Enabled only when there is data to transmit      |
| 13  | UE     | 1                              | Enable USART peripheral                          |

- **RE (Receiver Enable)**: 
	- The reset value is 0, meaning "receiver is disabled". 
	- Set it to 1, so that "receiver is enabled and begins searching for a start bit".
- **TE (Transmitter enable)**: 
	- The reset value is 0, meaning "transmitter is disabled". 
	- Set it to 1 to enable transmitter.
- **RXNEIE (RXNE interrupt enable)**: 
	- RXNE means "received Data Ready to be Read (Table 148. USART interrupt requests, p.1009)". 
	- The reset value is 0, meaning "interrupt is inhibited". 
	- Set it to 1, so that "an USART interrupt is generated whenever ORE=1 or RXNE=1 in the USART_SR register".
- **TXEIE (TXE interrupt enable)**:
	- TXE means "Transmit Data register empty".
	- The reset value is 0.
	- Keep it as 0 at initialization step. 
	- This bit is set to 1 only if there is data to transmit. An USART interrupt is generated whenever TXE=1 in the USART_SR register.
- **UE (USART enable)**:
	- The reset value is 0.
	- Set it to 1 to enable USART.

Unlike the other bits that are set enabled (1) at init, **TXEIE** should NOT be enabled at initialization time. If enabled, TXE will fire whenever the transmit register is empty, which is basically always true when you haven't started transmitting anything. 

Therefore, TXEIE bit is set disabled (0) at init, and is enabled only when you have data to transmit, then disable it inside the ISR (Interrupt Service Routine) once the buffer is empty. We'll talk more about TXEIE bit in Phase 3.

### 4.2. What About The Other Bit Fields in CR1?

| Bit | Name   | Value | Description                            |
| --- | ------ | ----- | -------------------------------------- |
| 0   | SBK    | 0     | Send Break                             |
| 1   | RWU    | 0     | Receiver wake-up                       |
| 4   | IDLEIE | 0     | IDLE interrupt enable                  |
| 6   | TCIE   | 0     | Transmission complete interrupt enable |
| 8   | PEIE   | 0     | PE interrupt enable                    |
| 9   | PS     | 0     | Parity selection                       |
| 10  | PCE    | 0     | Parity control enable                  |
| 11  | WAKE   | 0     | Wake-up method                         |
| 12  | M      | 0     | Word length                            |
| 14  | -      | 0     | Reserved, must be kept at reset value  |
| 15  | OVER8  | 0     | Oversampling mode                      |

To keep simplicity of the bare-metal UART driver:
- **SBK: We won't send break characters in this driver.
- **RWU, WAKE**: These are multi-receiver addressing features, which I won't use in my bare-metal UART driver.
- **IDLEIE**: IDLE interrupt fires when the line goes silent after receiving data. It's useful for detecting end-of-packet in some protocols, but not needed for basic operation.
- **TCIE**: Transmission Complete (TC) fires when the last bit has actually left the wire. It's useful when you need to know transmission if fully complete. Since we will toggle TXEIE, TCIE bit needs not be enabled.
- PEIE, PS, PCE: PEIE is Parity Error Enable, PS is Parity Selection, PCE is Parity Control Enable. We don't use parity check for now. 
- **M**: 0: 1 start bit, 8 data bits, n stop bit. 1: 1 start bit, 9 data bits, n stop bit. We choose 0.
- **OVER8: 0**: oversampling by 16 1: oversampling by 8. We agreed on selecting 16x oversampling.


### 4.3. Carefully Add Up Bit Fields

{% include figure.liquid loading="eager" path="/assets/post-attachments/2026-03-01/CR1_labeled.jpeg" class="img-fluid rounded z-depth-1" width="750px" %}


```
     0010 0000 0010 1100
= 0x 2    0    2    C
= 0x202C
```

**CR1 value is `0x202C`.**

### 4.4. I See USART_CR2 and CR3... What About These?
In fact, there is nothing you need to change in `USART_CR2` and `USART_CR3` registers.

---

## 5. uart_init() Code So Far

```c
void uart_init(void)
{
    // Step 1: Enable clocks
    RCC->AHB1ENR |= RCC_AHB1ENR_GPIOAEN;     // Enable GPIOA clock
    RCC->APB2ENR |= RCC_APB2ENR_USART1EN;    // Enable USART1 clock

    // Step 2: Configure PA9, PA10 as Alternate Function mode
    GPIOA->MODER &= ~(0x3 << 18);  // PA9 clear
    GPIOA->MODER |=  (0x2 << 18);  // PA9 AF mode
    GPIOA->MODER &= ~(0x3 << 20);  // PA10 clear
    GPIOA->MODER |=  (0x2 << 20);  // PA10 AF mode

    // Step 3: Assign AF7 (USART1) to PA9 and PA10
    GPIOA->AFR[1] &= ~(0xF << 4);  // PA9 clear
    GPIOA->AFR[1] |=  (0x7 << 4);  // PA9 AF7
    GPIOA->AFR[1] &= ~(0xF << 8);  // PA10 clear
    GPIOA->AFR[1] |=  (0x7 << 8);  // PA10 AF7

    // Step 4: Set baud rate — 9600 baud at 16 MHz HSI, OVER8=0
    USART1->BRR = 0x0683;

    // Step 5: Configure CR1 — enable UE, RXNEIE, TE, RE (TXEIE disabled at init)
    USART1->CR1 = 0x202C;

    // Step 6: Configure NVIC
    ...
}
```

Let’s take a closer look at this line: `USART1->BRR = 0x0683;`

To complete this one simple line, `USART1->BRR = 0x0683`, how long did we spend digging through the datasheet and analyzing it step by step? We take it for granted the header files with the complex numbers and init values, but now we realize they actually carry a lot of hidden story. Whenever you look at those header files and abstraction layers, you’ll be able to appreciate the effort of the engineers who created them.

---

## 6. What's Next?
- **NVIC Priority and enable ISR**: For a basic driver with only one interrupt source, the default priority is fine. But we will set the interrupt priority via `NVIC_SetPriority(USART1_IRQn, priority)`. And then, we enable ISR (Interrupt Service Routine) via `NVIC_EnableIRQ(USART1_IRQn)`.
- **ISR**: Implement `USART1_IRQHandler()`, the ISR for USART1. It handles TX and RX events with `RXNE` and `TXE` bits.
- **Ring Buffer**: A ring buffer data structure is needed for shared memory between Producer (the one who writes bytes in) and Consumer (ISR reads bytes out).
