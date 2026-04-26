---
layout: post
title: LightWeight IP (lwIP)
date: 2025-11-07 21:58:27
categories: ["Today I Learned"]
---

## Lightweight IP

Lighweight IP stack ("**lwIP**"[^1]) is a small independent implementation of the TCP/IP protocol suite, mainly designed for embedded systems. [^2]

## STM32 and lwIP

- STM32 board with Ethernet compatibility can be connected to the internet.
- STM32 Ethernet Library is based on **lwIP**.
- For example, STM32F767G Discovery board supports Ethernet communication by PHY (= physcial layer device) LAN8742A-CZ-TR and RJ45 jack. Some STM32 boards do not support Ethernet, and even STM32F7 boards that are not Discovery kit require a external PHY device for Ethernet.

<div class="image-row" markdown="1">
  {% include figure.liquid
     loading="eager"
     path="/assets/post-attachments/2025-11-07-img1.png"
     class="img-fluid rounded z-depth-1"
     figure_class="figure-lines"
     figure_style="--figure-lines:8"
     caption="LAN8742A-CZ-TR"
  %}

{% include figure.liquid
     loading="eager"
     path="/assets/post-attachments/2025-11-07-img2.png"
     class="img-fluid rounded z-depth-1"
     figure_class="figure-lines"
     figure_style="--figure-lines:8"
     caption="RJ45 connector (example)"
  %}

</div>

## References

[^1]: https://github.com/stm32duino/LwIP?tab=readme-ov-file

[^2]: https://www.nongnu.org/lwip/2_1_x/index.html
