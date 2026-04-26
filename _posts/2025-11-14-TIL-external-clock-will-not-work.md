---
layout: post
title: External Clock Will Not Work Unless You Have A External Hardware
date: 2025-11-14 23:48:46
description:
tags:
categories: ["Today I Learned"]
---

Today I worked on setting up Real Time Clock (RTC) on STM32 board. I spent more than a few hours debugging - or actually prompting AI.

At first, Github Copilot seemed to guide me through the debugging fairly well. The main problem was the `RTC_Init_LSE()`. I even dug into RCC and DBPR register values but couldn't solve the issue.

Tired of Copilot going down the same rabbit hole, I ended up creating a new account for Cursor.

Fortunately, Cursor (with Sonnet 4.5 Agent) gave me a new insight:

> Now I understand the issue! The STM32F429-Discovery board does not have the LSE crystal (32.768 kHz) populated by default. This is a very common issue with this board.

I realized I was trying to enable the LSE (Low Speed **External**) without an actual external hardware component. If I were to blame the AI, Copilot seamlessly - almost too naturally - suggested using LSE for the RTC feature and I didn't even think to doubt it. I just blindly went along the solution.

Thanks to this debugging process, I learned how to set system clock more thoroughly. But here's the caveat: don't take the AI's solution for granted. It can be wrong, and sometimes their solution sound so deceptively convincing.
