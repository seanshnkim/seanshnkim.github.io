---
layout: post
title: Clock Sources and Types in STM32
date: 2025-11-13 23:38:08
description:
tags:
categories: TIL
---

## Acknowledgements

I was googling, I came across this lecture slide: [The Clock of STM32F4](https://www.dmi.unict.it/santoro/teaching/lsm/slides/ClockSTM32.pdf)[^1][^3] by Professor Corrado Santoro (Universitaà di Catania). It basically covers all the necessary topics for understanding STM32 clock.

## Clock Sources and Types in Diagram

In STM32F4, there are two categories:

- High Speed vs. Low Speed
- External vs. Internal

![STM32 Clock Tree Diagram](/assets/post-attachments/stm32-clock-tree.svg)

### High Speed External (HSE)

- It has the advantage of producing a very accurate rate on the main clock.
- HSE can be generated from two possible clock: 1) crystal/ceramic resonator 2) user clock

### High Speed Internal (HSI)

- This internal 16MHz RC oscillator clock can be used directly as a system clock (usually it's STM32F4's system clock by default).[^2]
- It provides a clock source at low cost because it requires no external components. It also has a faster startup time than the HSE crystal oscillator.
- However, the frequency is less accurate than an HSE.

### Low Speed External (LSE)

- It is generated from the same source as HSE, an external crystal or a ceramic resonator.
- But the clock frequency (32.768 kHz) is significantly slow.[^4]
- Then why is this needed? It is low-powered, but provided highly accurate clock source to the real-time clock peripheral (RTC) for clock/calendar or other timing functions.

### Low Speed Internal (LSI)

- It acts as a low-power clock source that can be kept running in Stop and Standby mode for the independent \*watchdog (IWDG) and Auto-wakeup unit (AWU).
- \*Watchdog: If a software fails, or hangs (not refreshed) within the certain amount of time, then this hardware timer "watchdog" will trigger a system reset to restart the application. **Independent Watchdog (IWDG)** has its own clock source whereas **Window Watchdog (WWDG)** is clocked from the main system clock.[^4]

## Reference

[^1]: The Clock of STM32F4, https://www.dmi.unict.it/santoro/teaching/lsm/slides/ClockSTM32.pdf

[^2]: STM32 Basics \#3 - The Clock Configuration, https://www.youtube.com/watch?v=Xc8D_LKhBWk

[^3]: Corso di Embedded Systems Laurea in Informatica, https://www.dmi.unict.it/santoro/index.php?p=13

[^4]: STM32WB - IWDG, Independent watchdog, Revision 1.0, https://www.st.com/resource/en/product_training/STM32WB-WDG_TIMERS-Independent-Watchdog-IWDG.pdf

[^5]: RM0090 Reference manual, https://www.st.com/resource/en/reference_manual/dm00031020-stm32f405-415-stm32f407-417-stm32f427-437-and-stm32f429-439-advanced-arm-based-32-bit-mcus-stmicroelectronics.pdf
