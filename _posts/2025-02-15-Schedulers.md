---
layout: post
title: Schedulers in FreeRTOS
date: 2025-02-15 16:43:10
description:
tags:
  - Schedulers
categories:
  - RTOS
---

## Scheduler

In this chapter, we are going to discuss the scheduler. The task scheduler is the core part of an RTOS. In fact, the key role of an operating system is to efficiently distribute CPU resources and time to each task, and to do that, it is important to understand some key concepts first.

## Tick, the heartbeat of RTOS

How does a computer know how much time has passed? When does a computer know that it must perform specific tasks?

There is a clock inside the computer, and the tick tells the computer how much time has elapsed.

1. Timer: From LED dimming to Pulse Width Modulation (PWM) and a calendar in a smartwatch, a timer is an essential feature. The tick enables the timer because it is the basic unit of time measurement.
2. Time delays: Tasks sometimes need to be delayed. In other words, they are assigned a specific number of clock ticks to wait before execution.
3. Context switching: This is a more advanced topic. The interrupt happens at a specific tick and allows the system to switch between different tasks. If a higher-priority task needs to run, the tick interrupt allows the RTOS to make that decision.

<div class="image-row">
  <figure class="mt-3">
    {% include figure.liquid loading="eager" path="assets/post-attachments/Scheduler/tick_1.png" class="img-fluid rounded z-depth-1" width="150px" %}
  </figure>
  <figure class="mt-3">
    {% include figure.liquid loading="eager" path="assets/post-attachments/Scheduler/tick_2.png" class="img-fluid rounded z-depth-1" width="500px" %}
  </figure>
</div>

These are just a few examples, but in fact the tick is like the heartbeat and central nervous system of the RTOS.  
The tick drives many internal RTOS functions, ranging from task management to system monitoring.  
The function that generates the tick is actually named `TickISR` (Interrupt Service Routine).[^3]

## How is scheduler actually implemented in FreeRTOS?

Now that the theoretical part is explained, it is time to dissect how it is actually implemented in code.  
Let's look into the `main.c` code.

### 1. `vTaskStartScheduler()` in `main.c`

This function is defined in `tasks.c` of the FreeRTOS kernel (`FreeRTOS > tasks.c`) and is used to start the RTOS scheduler.

> A FreeRTOS application will start up and execute just like a non-RTOS application until [vTaskStartScheduler()](https://www.freertos.org/Documentation/02-Kernel/04-API-references/04-RTOS-kernel-control/03-vTaskStartScheduler) is called. vTaskStartScheduler() is normally called from the application's main() function. The RTOS only controls the execution sequencing after vTaskStartScheduler() has been called. [^1]

First, it creates the idle task and the timer daemon task.  
Then it calls `xPortStartScheduler()` to perform the architecture-specific initialization.

### 2. `xPortStartScheduler()` in `port.c`

To be morMore specifically, it:

1. Configures the priority for the PendSV and SysTick timer interrupts to be as low as possible. This is implemented by storing the priority value in a register: `portNVIC_SHPR3_REG |= portNVIC_PENDSV_PRI`, `portNVIC_SHPR3_REG |= portNVIC_SYSTICK_PRI`.
2. Configures the `SysTick` timer to issue interrupts at the desired rate. The customized rate is assigned to the variable `FreeRTOSConfig.h > configTICK_RATE_HZ`.
3. Enables the SysTick timer interrupt and starts the first task (including the timer) by executing the SVC instruction (`prvPortStartFirstTask`).

As mentioned, `port.c` provides hardware-specific implementations for the RTOS.  
In `port.c` (`FreeRTOS (Kernel) > portable > RVDS > ARM_CM4F > port.c`), you can find the following three key functions:

4. `vPortSVCHandler()`
5. `xPortPendSVHandler()`
6. `xPortSysTickHandler()`

Though their names may sound unfamiliar, each function has a simple and clear role.

### 2. Starting point: `vPortSVCHandler()`

`vPortSVCHandler()` is the starting point of the FreeRTOS scheduler.  
When `vPortSVCHandler()` is called, it means the FreeRTOS scheduler is being started.  
In other words, it is used to launch the very first task. In its name, SVC stands for “Supervisor Call” exception.

### 3. Context Switching: `xPortPendSVHandler()`

If you are using a processor other than an ARM Cortex-M, you will not see this function in your program, because `xPortPendSVHandler()` is specifically designed for ARM Cortex-M processors.  
For this project, the MCU is STM32F429I, and all STM32F4 series MCUs are based on ARM Cortex-M4 processors.

`xPortPendSVHandler()` enables **context switching** between tasks.  
Context switching means that when the computer needs to switch from Task A to Task B, it first saves the “context” of the previous task (Task A), as shown in the illustration[^2].

`xPortPendSVHandler()` is triggered by setting the PendSV system exception in the ARM core. In its name, PendSV stands for “Pendable Service”.

<figure class="mt-5">
{% include figure.liquid loading="eager" path="assets/post-attachments/Scheduler/context-switch.png" class="img-fluid rounded z-depth-1 center-image" width="600px" %}
</figure>

### 4. Handles tick-relevant tasks: `xPortSysTickHandler()`

When a tick occurs (in other words, when a SysTick interrupt occurs), `xPortSysTickHandler()` is called.  
So `xPortSysTickHandler()` is essentially the SysTick interrupt handler.  
It is also specific to ARM Cortex-M microcontrollers. `xPortSysTickHandler()` performs several essential tasks:

- Increments the tick count `xTickCount`
- Checks if a context switch is required and, if so, triggers it using the PendSV interrupt
- If tickless idle mode is enabled, adjusts the tick count to account for time spent in low-power states

There is another important function named `vPortSetupTimerInterrupt()` that is used to configure the timer for the RTOS tick.

## FreeRTOS Kernel Interrupts

Interrupts are a fundamental mechanism in an OS for stopping and resuming tasks managed by the scheduler.  
FreeRTOS uses the following kernel interrupts:

7. SVC interrupt: The SVC handler is used to launch the very first task.
8. PendSV interrupt: The PendSV handler is used to perform context switching between tasks.
9. SysTick interrupt: The SysTick handler implements RTOS tick management.

If the SysTick interrupt is already used for some other purpose in your application, you may have to use another available timer peripheral instead.  
All of these interrupts are configured with the lowest possible interrupt priority.

## Why is SysTick Timer important?

In `FreeRTOSConfig.h`, there is a configuration value called `configTICK_RATE_HZ`.  
For example, if it is set to 1000 Hz, the SysTick timer fires an interrupt every 1 ms (1000 times per second).  
This value defines how often a SysTick interrupt occurs. Internally, the RTOS tick is implemented using the MCU’s hardware timer.

The variable `xTickCount` is the key to keeping track of time.  
For example, it is used when calling `vTaskDelay(100)`.

Apart from incrementing the tick count, the RTOS tick is also used to trigger a context switch to the next task that is ready to run.

10. The tick ISR runs `xPortSysTickHandler()`.
11. `portDISABLE_INTERRUPTS()` is called.
12. `xTickCount++`. Also, if `xTaskIncrementTick()` returns `pdTRUE`, it means a context switch is actually required.
13. It checks whether the new tick value will unblock any tasks.
14. It determines which task should run next. All tasks in the Ready state are scanned, and if a task is found, a context switch is requested by pending the PendSV interrupt.
15. `portENABLE_INTERRUPTS()` is called.

The PendSV handler then takes care of switching out the old task and switching in the new task.  
Now, let’s go to `port.c` and look at `xPortSysTickHandler()`.

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

First, it increments the tick.  
In this example, assume the CPU clock frequency is set to 16 MHz and `configTICK_RATE_HZ` is set to 1000 Hz.  
“Clock” here means the processor generates a pulse to perform basic operations \(16 \times 10^6\) times per second.  
By the same logic, the tick occurs 1000 times every second.

The SysTick “load register” (the SysTick Reload Value Register, `portSYSTICK_NVIC_LOAD_REG`) stores the value that will be loaded into the counter.  
It will count from some value \(X\) down to 0 every 1 ms.

$$ X = 16 \times 10^6 \div 1,000 = 16,000$$

When the SysTick timer starts, it counts down from 15,999 to 0. It generates an interrupt when the count value reaches 0 and then reloads the load value again. Therefore, 15,999 is the initial SysTick load value required to generate an interrupt every 1 ms.

## References

[^1]: https://www.freertos.org/Documentation/01-FreeRTOS-quick-start/01-Beginners-guide/03-Build-your-first-project

[^2]: https://www.techtarget.com/whatis/definition/context-switch

[^3]: https://www.freertos.org/Documentation/02-Kernel/05-RTOS-implementation-tutorial/02-Building-blocks/03-The-RTOS-tick
