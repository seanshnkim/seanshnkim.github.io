---
layout: page
title: "Building a Bootloader with OTA Update"
permalink: /projects/bootloader-ota/
description: "A custom bootloader that enables Over-The-Air (OTA) update through Bluetooth."
tags: ["Firmware", "STM32", "Dual Bank Memory"]
category: Firmware
importance: 1
timeline: "Jan – Mar 2026"
toc:
  sidebar: left
---

A custom bootloader that enables Over-The-Air (OTA) update through Bluetooth.

Built on the STM32F429I-DISC1, this project implements a dual-bank memory architecture that allows safe firmware updates with automatic rollback on failure.

## Project Overview

- **Hardware**: STM32F429I-DISC1
- **IDE**: STM32CubeIDE
- **Key Features**: Dual-bank flash, OTA via UART/BLE, CRC32 verification, automatic rollback

## Series Posts

See the full write-up series for a detailed breakdown of each phase:

- [Introduction & Project Goals](/projects/2026-01-13-Dual-Bank-Bootloader-Intro/)
- Phase 1: Understanding Flash Operations
- Phase 2: Minimal Bootloader and Jump-to-Application
- Phase 3: Dual-Bank Selection
- Phase 4: Persistent State Management
- Phase 5: OTA Protocol Implementation
