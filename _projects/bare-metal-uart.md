---
layout: page
title: "Bare-Metal UART Driver"
permalink: /projects/bare-metal-uart/
description: "UART is the simplest form of communication protocol in embedded systems. Built on STM32F429I, I walked through every building process of bare-metal UART driver from scratch."
tags: ["Firmware", "UART", "BLE"]
toc:
  sidebar: left
---

UART is the simplest form of communication protocol in embedded systems. Built on STM32F429I, I walked through every building process of bare-metal UART driver from scratch.

## Project Overview

- **Hardware**: STM32F429I-DISC1
- **IDE**: STM32CubeIDE
- **Key Topics**: Clock configuration, GPIO alternate functions, USART registers, interrupt-driven TX/RX

## Goals

This project covers building a UART driver without relying on HAL or any middleware — configuring every register by hand, from clock initialization to interrupt handling.
