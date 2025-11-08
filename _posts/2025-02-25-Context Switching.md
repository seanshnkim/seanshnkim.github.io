---
layout: post
title: Context Switching in RTOS
date: 2025-02-25 17:30:00
description:
tags:
  - Context-Switching
categories:
  - RTOS
---

In FreeRTOS, context switching is taken care by PendSV Handler found in port.c

If the scheduler is priority based pre-emptive scheduler, then for every RTOS tick interrupt, the scheduler will compare the priority of the running task with the priority of ready tasks list.

If there is any ready task whose priority is higher than the running task, then context switch will occur.

On FreeRTOS you can also trigger context switch manually using taskYIELD() macro.

Context switch also happens immediately whenever new task unblocks and if its priority is higher than the currently running task.

### Task State

When a task executes on the processor it utilizes

- processor core registers
- a task wants to do any push and pop operations (during function call) then it uses its own dedicated stack memory.

so the state of the task = (contents of the processor core registers) + (stack contents)

### Why do we have to know about ARM Cortex Mx Core Registers?

Attach an image of the core registers!

Explain each register. What are they for?

PSP is used for user tasks, MSP is used for kernel.

Program status register.

### Stack

There are mainly two different stack memories during run time of FreeRTOS based application.

- Task's private stack (process stack) -> PSP
  - When task executes it does PUSH and POP here
- Kernel stack (main stack) -> MSP
  - When ISR executes it does PUSH and POP here

### RAM

Illustration of stack memory in RAM
In RAM, there are three sections:

- Heap: Task stack and task control block (TCB) of each task
- Kernel stack
- Global space

Heap size is defined by `configTOTAL_HEAP_SIZE`.

### xTaskCreate()

- pxTopOfStack: TCB will be created in RAM (Heap section) and be initialized
- Stack: Dedicated stack memory will be created for a task and initialized. This stack memory will be tracked using PSP register.
- Task Ready List maintained by FreeRTOS kernel: Task will be put under "ready" list for scheduler to pick

### xPortPendSVHandler()

In `port.c`.

pxCurrentTCB
