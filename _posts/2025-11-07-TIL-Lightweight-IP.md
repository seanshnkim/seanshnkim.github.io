---
layout: post
title: Set Your Own Title
date: 2025-xx-xx 00:00:00
description:
tags:
categories: TIL
---

## Lightweight IP

Lighweight IP stack ("**lwIP**"[^1]) is a small independent implementation of the TCP/IP protocol suite, mainly designed for embedded systems. [^2]

## STM32 and lwIP

- STM32 board with Ethernet compatibility can be connected to the internet.
- STM32 Ethernet Library is based on **lwIP**.
- For example, STM32F767G Discovery board supports Ethernet communication by PHY (= physcial layer device) LAN8742A-CZ-TR and RJ45 jack. Some STM32 boards do not support Ethernet, and even STM32F7 boards that are not Discovery kit require a external PHY device for Ethernet.

{% include figure.liquid loading="eager" path="assets/post-attachments/2025-11-07-img1.png" class="img-fluid rounded z-depth-1" width="250px"%}[^3]

{% include figure.liquid loading="eager" path="assets/post-attachments/2025-11-07-img2.png" class="img-fluid rounded z-depth-1" width="300px"%}[^4]

## References

[^1]: https://github.com/stm32duino/LwIP?tab=readme-ov-file

[^2]: https://www.nongnu.org/lwip/2_1_x/index.html

[^3]: https://www.digikey.com/en/products/detail/microchip-technology/LAN8742A-CZ-TR/4079931

[^4]: https://www.digikey.com/en/products/detail/te-connectivity-amp-connectors/1-1734264-1/5263528?gclsrc=aw.ds&gad_source=1&gad_campaignid=20234014242&gbraid=0AAAAADrbLlgRWUSz9Yq8wx-Isk7MjtbxE&gclid=CjwKCAiAzrbIBhA3EiwAUBaUdWvqgzcE87tvhaUP0VD8Rl4TgfryUC7WpndZSCmXRIC72WZU-lNzqRoCh5YQAvD_BwE
