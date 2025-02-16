---
layout: post
title: Schedulers
date: 2025-02-15 16:43:10
description: 
tags:
  - Schedulers
categories: RTOS
---

## What are schedulers?

- vPortSVCHandler()
- xPortPendSVHandler()
- xPortSysTickHandler()

### What does vPortSVCHandler() do?

It is used to launch the very first task.
It is triggered by SVC Instruction

### What does xPortPendSVHandler() do?
It is used to achieve the **context switching** between tasks.
It triggered by pending the PendSV System exception of ARM.


### What does xPortSysTickHandler() do?
This implements the RTOS Tick management.
Triggered periodically by Systick timer of ARM cortex Mx processor.

### port.c is important
These are all found in port.c

### vTaskStartScheduler()
This is implemented in tasks.c of FreeRTOS kernel and used to start the RTOS scheduler.

> A FreeRTOS application will start up and execute just like a non-RTOS application until [vTaskStartScheduler()](https://www.freertos.org/Documentation/02-Kernel/04-API-references/04-RTOS-kernel-control/03-vTaskStartScheduler) is called. vTaskStartScheduler() is normally called from the application's main() function. The RTOS only controls the execution sequencing after vTaskStartScheduler() has been called. [^1]

What does vTaskStartScheduler() create?
It creates the idle and timer daemon task.

What does vTaskStartScheduler() call?
It calls xPortStartScheduler() to do the architecture specific initializations.
xPortStartScheduler() is actually in port.c

1) Configure sysTick timer to issue interrupts at desired rate. This is configured in FreeRTOSConfig.h -> configTick_RATE_HZ (`vPortSetupTimerInterrupt()`)
2) Configures the priority for PendSV and Systick interrupts (`portNVIC_SHPR3_REG |= portNVIC_PENDSV_PRI`, `portNVIC_SHPR3_REG |= portNVIC_SYSTICK_PRI`)
3) Starts the first task by executing the SVC instruction (`prvPortStartFirstTask`)

In `prvPortStartFirstTask`, it will execute SVC instruction

SVC Handler will execute.

vPortSVCHandler()
PendSVHandler()
SysTickHandler()


## FreeRTOS Kernel Interrupts
When FreeRTOS runs on ARM Cortex Mx Processor based MCU, below interrupts are used to implement the scheduling of tasks.

1. SVCInterrupt (SVC handler will be used to launch the very first task)
2. PendSVInterrupt (PendSV handler is used to carry out context switching between tasks)
3. SysTick Interrupt (SysTick handler implements the RTOS Tick Management)

If SysTick interrupt is used for some other purpose in your application, then you may use any other available timer peripheral.

All interrupts are configured at the lowest interrupt priority possible.


## Why is SysTick Timer important? How do we set the timer?

In FreeRTOSConfig.h, there is a variable called `configTICK_RATE_HZ` portTickType 1000
-> It means interrupt is fired by SysTick timer for every 1ms

This sets how often interrupts are "fired" (It is fired by systick timer)

RTOS ticking is implemented using timer hardware of the MCU

To keep track of time. xTickCount variable is a key.
For example, it is used for vTaskDelay(100).

RTOS tick, apart from incrementing the tick count, is used to trigger the context switch to the next potential task.

1. The tick ISR runs
2. All the ready state tasks are scanned
3. Determines which is the next potential task to run
4. If found, triggers the context switching by pending the PendSV interrupt
5. The PendSV handler takes care of switching out of old task and switching in of new task

Let's go to `port.c` and see xPortSysTickHandler.
First, increment the tick.

```c
void xPortSysTickHandler( void )
{
	/* The SysTick runs at the lowest interrupt priority, so when this interrupt
	executes all interrupts must be unmasked.  There is therefore no need to
	save and then restore the interrupt mask value as its value is already
	known. */
	portDISABLE_INTERRUPTS();
	{
		/* Increment the RTOS tick. */
		if( xTaskIncrementTick() != pdFALSE )
		{
			/* A context switch is required.  Context switching is performed in
			the PendSV interrupt.  Pend the PendSV interrupt. */
			portNVIC_INT_CTRL_REG = portNVIC_PENDSVSET_BIT;
		}
	}
	portENABLE_INTERRUPTS();
}
```

xTaskIncrementTick() returns `xSwitchRequired`. 
Then what does xPortSysTickHandler() do?

The SysTick timer when started, down counts from 24999 to 0.
It generates an interrupt when the count value reaches 0 and again reloads the load count value.

So, 24999 is the systick load value required to generate interrupt for every 1ms (1000Hz)

[^1]: https://www.freertos.org/Documentation/01-FreeRTOS-quick-start/01-Beginners-guide/03-Build-your-first-project