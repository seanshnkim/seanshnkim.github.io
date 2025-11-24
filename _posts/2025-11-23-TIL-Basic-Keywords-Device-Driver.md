---
layout: post
title: Basic Keywords for Developing a Linux Device Driver
date: 2025-11-23 23:48:41
description:
tags:
categories: TIL
---

## 1. Character Device vs. Block Device

**Character device**: Keyboards, serial port, sound cards, etc. As you can see, keyboards transmit data as a stream of characters(bytes). One of the main characteristic of character devices is that it doesn't have buffering for sequential data. Typically random access is not allowed (there is a reason why I said "typically" [^1], because it only handles "sequential" access.

**Block device**: Hard drives, SSDs, USB drives, etc. They are buffered, handle data in fixed-size blocks and support random access. Operations involve reading/writing whole blocks of data, supporting operations such as seeking within a file.​

## 2. Major Number vs. Minor Number

> Devices have major and minor numbers. The **major number** specifies the device type whereas the **minor number** specifies an instance of that type. As such, it is common that a single device driver takes care of an entire major number.

If the major number identifies the driver (type) associated with a device, then the minor number differentiates between individual instances or units handled by the same driver.
For example, multiple serial ports may use the same driver (same major number) but are differentiated by their minor numbers.

## Kernel Module

Device drivers are often built as **kernel modules**. A kernel module can be simply thought as a piece of code, but with special purposes. It can be dynamically loaded/unloaded into the OS kernel without rebooting or recompiling the kernel. [^2]

A device driver is a specific type of kernel module. A driver itself is software, or some special type of software that serves as an "interface" to hardware devices for operating systems.[^3]

## Device File

Device in Linux is interpreted as a file. These special files located in `/dev` (like `/dev/sda` or `/dev/tty`) are the interface between user space and device drivers. Then why is it represented as a file? Because then an user (or user applications) can communicate with hardware using standard file operations. Device drivers in the kernel space cannot be accessed by user directly.

## References

[^1]: https://www.linuxquestions.org/questions/linux-newbie-8/what-are-the-differences-between-character-devices-and-block-devices-4175530933/

[^2]: The Linux Kernel Module Programming Guide: https://sysprog21.github.io/lkmpg/. Most kernel programming guides available in the internet seem to be outdated (2.6.x kernel version), but this project updates its contents to the latest version (5.x and 6.x kernel versions). For more information, look into the github repository.

[^3]: https://en.wikipedia.org/wiki/Device_driver
