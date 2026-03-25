---
layout: post
title: "UART Bare-Metal Driver Phase 2: Implementing ISR"
date: 2026-03-01 12:41:50
categories: Firmware
toc: '{"beginning":true,"sidebar":"left"}'
---

**Status:** ✅ BRR, CR1 configured. ISR pseudocode complete. Ring buffer next.

---

## 1. Progress This Session

Continued from Session 01 where GPIO and clock configuration were completed.  
This session covered Steps 4–6 of the full init sequence:

```
Step 4: Configure USART1    → BRR, CR1                          ← DONE
Step 5: Configure NVIC      → NVIC_EnableIRQ, NVIC_SetPriority  ← DONE
Step 6: Write ISR           → USART1_IRQHandler() pseudocode    ← DONE
```

### x.8 The NVIC (Nested Vector Interrupt Controller)

- Hardware block that manages which interrupts are enabled and at what priority
- Acts as a **gatekeeper** — even if USART1 fires an interrupt, NVIC can block it
- You must call `NVIC_EnableIRQ(USART1_IRQn)` to allow it through
- Your ISR must be named exactly **`USART1_IRQHandler()`** — must match the vector table entry in startup file

---

## 2. Key Concepts Learned

### 2.1 Default Clock Chain After Reset

The APB2 clock frequency (which feeds USART1) must be derived from the reset state of the clock tree:

| Stage                  | Value           | Source                                               |
| ---------------------- | --------------- | ---------------------------------------------------- |
| Clock source           | HSI             | Selected automatically after reset (RM0090 §7.2.6)   |
| HSI frequency          | 16 MHz          | Internal RC oscillator                               |
| APB2 prescaler (PPRE2) | 1 (no division) | RCC_CFGR reset value = 0x0000 0000, PPRE2 bits = 000 |
| **APB2 clock (fCK)**   | **16 MHz**      |                                                      |

**Key lesson:** Always verify reset values directly from the register summary table in the manual. Do not infer them — assuming a reset value and being wrong causes subtle bugs.

---

### 2.2 Baud Rate Register (BRR)

**Formula (OVER8 = 0, oversampling by 16):**

```
Tx/Rx baud = fCK / (8 × (2 − OVER8) × USARTDIV)
           = fCK / (16 × USARTDIV)
```

**Deriving USARTDIV for 9600 baud at 16 MHz:**

```
USARTDIV = fCK / (16 × baud)
         = 16,000,000 / (16 × 9600)
         = 104.1667
```

**Splitting into mantissa and fraction:**

- Mantissa = 104 → binary `0000 0110 1000`
- Fraction = 0.1667 × 16 = 2.667 → rounded to 3 → binary `0011`

**BRR value: `0x0683`**

**Verification:**

```
USARTDIV = 104 + 3/16 = 104.1875
Actual baud = 16,000,000 / (16 × 104.1875) = 9,598.08
Error = 0.02%   ← well within the 2% UART tolerance
```

#### ⚠️ Mistakes Made / Corrections

| Mistake                                                        | Correction                                                                                      |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Initially assumed APB2 = 84 MHz (the max, not the default)     | 84 MHz is the maximum APB2 frequency. After reset, APB2 = HSI = 16 MHz                          |
| Set up equation as `16 MHz / x = 9600`, giving USARTDIV = 1666 | The oversampling factor of 16 belongs in the denominator. Correct: USARTDIV = fCK / (16 × baud) |
| Arithmetic error converting 1666 binary → hex                  | After correcting USARTDIV to 104, the correct BRR = 0x0683                                      |
| Stated 0.0199% error as "about 2%"                             | 0.02% and 2% are very different. Read percentages carefully.                                    |

---

### 2.3 Control Register 1 (CR1)

**Bits set for basic interrupt-driven UART:**

| Bit | Name   | Value     | Reason                                                  |
| --- | ------ | --------- | ------------------------------------------------------- |
| 13  | UE     | 1         | Enable USART peripheral                                 |
| 5   | RXNEIE | 1         | Enable interrupt when RX data register not empty        |
| 3   | TE     | 1         | Enable transmitter                                      |
| 2   | RE     | 1         | Enable receiver                                         |
| 7   | TXEIE  | 0 at init | Enabled only when there is data to transmit (see below) |

**CR1 value: `0x202C`**

**Bits left at reset (0):**

- OVER8 = 0 → oversampling by 16 (default, safe choice)
- M = 0 → 8 data bits
- PCE = 0 → no parity (8N1 configuration)
- WAKE, RWU, SBK → mute mode / LIN features, not needed

#### ⚠️ Mistakes Made / Corrections

| Mistake                                              | Correction                                                                                                                                                                   |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wanted to enable PEIE, TCIE, IDLEIE, TXEIE at init   | Only enable interrupts your driver actually uses. Unnecessary interrupts waste CPU or cause hard-to-trace bugs                                                               |
| Confused CLKEN (in CR2) with peripheral clock enable | CLKEN enables the CK pin for synchronous/SPI mode only. Peripheral clock is already enabled via RCC                                                                          |
| Used `=` to write CR1 without thinking               | Direct `=` is acceptable here because uart_init() runs once from reset state. Use clear-then-set only when modifying bits in a register that may already have other bits set |

**Critical insight on TXEIE:**  
TXE fires whenever the transmit register is empty — which is always true at startup. Enabling TXEIE at init causes the ISR to fire immediately and continuously before any data is queued. The correct pattern:

- Enable TXEIE only when `uart_send_string()` loads data into the TX buffer
- Disable TXEIE inside the ISR when the TX buffer is empty

---

### 2.4 Control Register 2 (CR2)

- STOP bits = `00` → 1 stop bit (correct for 8N1)
- All other bits left at reset value `0x0000`
- **No write to CR2 needed in init code** — don't write registers you don't need to touch

---

### 2.5 NVIC Configuration

```c
NVIC_SetPriority(USART1_IRQn, 1);   // Set priority explicitly — don't rely on default
NVIC_EnableIRQ(USART1_IRQn);        // Allow USART1 interrupts through the gatekeeper
```

USART1 IRQ position: 37 (from RM0090 Table 63, p.378)  
ISR must be named exactly: `USART1_IRQHandler()` — must match vector table entry in startup file.

---

### 2.6 ISR Design — USART1_IRQHandler()

The ISR handles both TX and RX events. It determines which event fired by checking the status register (USART_SR):

- **Bit 5 RXNE** — RX data register not empty → byte received
- **Bit 7 TXE** — TX data register empty → ready for next byte

**Pseudocode:**

```
USART1_IRQHandler:
    if USART1->SR & (1 << 5):        // RXNE
        read byte from USART1->DR
        store in RX ring buffer

    if USART1->SR & (1 << 7):        // TXE
        if TX ring buffer has data:
            load next byte → USART1->DR
        else:
            disable TXEIE             // USART1->CR1 &= ~(1 << 7)
```

---

## 3. Complete uart_init() — Final Code

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
    NVIC_SetPriority(USART1_IRQn, 1);
    NVIC_EnableIRQ(USART1_IRQn);
}
```

---

## 4. What's Next — Session 03

### Immediate next step: Ring Buffer

Before implementing the ISR and TX functions in C, a ring buffer data structure is needed. It serves as the shared memory between:

- **Producer:** `uart_send_string()` writes bytes in
- **Consumer:** ISR reads bytes out (TX), or ISR writes bytes in / `uart_read_byte()` reads out (RX)

### Functions remaining to implement:

1. Ring buffer (`init`, `write`, `read`, `is_empty`, `is_full`)
2. `USART1_IRQHandler()` — full C implementation
3. `uart_send_byte(uint8_t data)`
4. `uart_send_string(const char *str)`
5. `uart_read_byte()`

### Key question to think about before Session 03:

A ring buffer uses a fixed-size array. If the producer writes to the end of the array but the consumer has freed up space at the beginning — where does the producer write next? How do you track the read and write positions?
