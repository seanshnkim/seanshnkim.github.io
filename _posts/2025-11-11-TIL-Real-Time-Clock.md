---
layout: post
title: Real Time Clock in STM32
date: 2025-11-11 21:08:46
description:
tags:
categories: ["Today I Learned"]
---

## What is Real Time Clock (RTC)?

- It refers to a hardware component (peripheral).[^1]
- Features timekeeping such as calendar with alarms, when the device is running in a low-power mode (e.g. run on a coin battery).[^2]
- In STM32 board, it is clocked by the low-speed external oscillator (LSE) at 32.768 kHz, the RTC is functional even when the main supply is off. However, the VBAT (Voltage of Battery) domain needs to be supplied by a backup battery.[^3]

## Reference

[^1]: https://wiki.st.com/stm32mcu/wiki/Getting_started_with_RTC

[^2]:
    https://controllerstech.com/internal-rtc-in-stm32/
    https://www.st.com/resource/en/product_training/stm32l4_wdg_timers_rtc.pdf

[^3]: https://www.st.com/resource/en/product_training/stm32l4_wdg_timers_rtc.pdf

[^4]: https://www.st.com/resource/en/datasheet/stm32f427vg.pdf

[^5]: https://embeddedhash.in/real-time-clock-in-embedded-systems/
