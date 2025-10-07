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

In this chapter, we are going to discuss scheduler. Task scheduler is the core part of RTOS. In fact, the key role of operating system is to 각 task에게 CPU 자원과 시간을 잘 배분하는 것이라고 할 수 있다. 근데 그러려면 일단 키워드부터 알아야 한다.

## Tick, the heartbeat of RTOS

How does a computer know how long the time elapsed? When does a computer know that it must perform designated tasks?

There is a clock inside computer, and tick tells computer how long it took.

1. Timer: From LED dimming to Pulse Width Modulation (PWM) and a calendar in a smart watch, timer is an essential feature. Tick enables timer, because it is the basic unit of time count.
2. Time delays: Tasks sometimes need to be delayed. In other words, they are assigned a specific number of clock ticks to wait before execution.
3. Context Switching: This is more in-depth (심화 내용) part. The interrupt happens at a certain tick, and it enables to switch between different tasks. If there is a higher priority task needs to run, the tick interrupt allows the RTOS to determine.

<div class="image-row">
  <figure class="mt-3">
    {% include figure.liquid loading="eager" path="assets/post-attachments/Scheduler/tick_1.png" class="img-fluid rounded z-depth-1" width="150px" %}
  </figure>
  <figure class="mt-3">
    {% include figure.liquid loading="eager" path="assets/post-attachments/Scheduler/tick_2.png" class="img-fluid rounded z-depth-1" width="500px" %}
  </figure>
</div>

I took only a few examples, but in fact tick is like heartbeat of RTOS, 중추 역할을 한다. Tick drives internal RTOS functionalities, ranging from task management to system monitoring. And the function that generates tick is actually named "TickISR (Interrupt Service Routine)".[^3]

## How is scheduler actually implemented in FreeRTOS?

Now theoretical part is explained, it is time to dissect how it is actually implemented in code.
Let's look into `main.c` code.

### 1. `vTaskStartScheduler()` in `main.c`

This function is defined in `tasks.c` of FreeRTOS kernel (`FreeRTOS > tasks.c`) and used to start the RTOS scheduler.

> A FreeRTOS application will start up and execute just like a non-RTOS application until [vTaskStartScheduler()](https://www.freertos.org/Documentation/02-Kernel/04-API-references/04-RTOS-kernel-control/03-vTaskStartScheduler) is called. vTaskStartScheduler() is normally called from the application's main() function. The RTOS only controls the execution sequencing after vTaskStartScheduler() has been called. [^1]

First, it creates the idle and timer daemon task. Then it calls `xPortStartScheduler()` to do the architecture specific initializations.

### 2. `xPortStartScheduler()` in `port.c`

To be more specific, it:

1. configures priority for PendSV and SysTick Timer interrupts to be lowest as possible. This is implemented as saving priority value in a register: `portNVIC_SHPR3_REG |= portNVIC_PENDSV_PRI`, `portNVIC_SHPR3_REG |= portNVIC_SYSTICK_PRI`.
2. configures `SysTick` timer to issue interrupts at a desired rate. The customized rate is assigned into the variable `FreeRTOSConfig.h > configTick_RATE_HZ`.
3. enables the SysTick timer interrupt and starts the first task (including timer) by executing the SVC instruction. (`prvPortStartFirstTask`)

As said, `port.c` provides hardware-specific implementations for RTOS. In `port.c` (`FreeRTOS (Kernel) > portable > RVDS > ARM_CM4F > port.c`), and you will be able to find the following three key functions: 4. vPortSVCHandler(): 5. xPortPendSVHandler(): 6. xPortSysTickHandler()

Though their names are quite unfamiliar (알아듣기 어렵지만), each of its role is simple and clear.

### 2. Starting point: `vPortSVCHandler()`

`vPortSVCHandler()` is the starting point of FreeRTOS scheduler. If `vPortSVCHandler()` is called, it means the FreeRTOS scheduler is launched. In other words, it is used to launch the very first task. In its name, SVC stands for 'Supervisor Call' exception.

### 3. Context Switching: `xPortPendSVHandler()`

If you are using a type of processor other than ARM Cortex-M processors, you won't see such function in your program, because `xPortPendSVHandler()` is specifically designed for ARM Cortex-M processors. For my project, I am using STM32F429I and STM32F4 series of MCUs are all based on ARM Cortex-M4 processors.

`xPortPendSVHandler()` enables **context switching** between tasks. What is context switching? In short, when computer needs to switch from Task A to Task B, it needs to save the 'context' of the previous task (Task A) as seen in the illustration[^2].

`xPortPendSVHandler()` is triggered by pending the PendSV system exception of ARM. In its name, PendSV stands for 'Pendable Service'.

<figure class="mt-5">
{% include figure.liquid loading="eager" path="assets/post-attachments/Scheduler/context-switch.png" class="img-fluid rounded z-depth-1 center-image" width="600px" %}
</figure>

### 4. Handles tick-relevant tasks: `xPortSysTickHandler()`

When tick occurs (in other words, when SysTick interrupt occurs) `xPortSysTickHandler()` is called. So `xPortSysTickHandler()` is another name for SysTick interrupt handler. It is also ARM Cortex-M microcontroller specific. `xPortSysTickHandler()` performs several essential tasks:

- Increments tick count `xTickCount`
- Checks if a context switch is required, and triggers it using PendSV interrupts
- If tickless idle mode is enabled, it adjusts the tick count to account for time spent in low-power states.

There is another important function named `vPortSetupTimerInterrupt()` in `xPortSysTickHandler`. It configures the timer used for RTOS tick.

## FreeRTOS Kernel Interrupts

Interrupt is a fundamental mechanism in OS to stop and resume scheduler tasks. FreeRTOS has the following "kernel" interrupts: 7. SVCInterrupt: SVC handler will be used to launch the very first task. 8. PendSVInterrupt: PendSV handler is used to carry out context switching between tasks. 9. SysTick Interrupt: SysTick handler implements the RTOS Tick Management.

If SysTick interrupt is used for some other purposes in your application, then you may have to use any other available timer peripheral. All interrupts are configured at the lowest interrupt priority possible.

## Why is SysTick Timer important?

In FreeRTOSConfig.h, there is a variable called `configTICK_RATE_HZ`. It means the interrupt is fired by SysTick timer for every 1ms (1000 times per second = every 1 millisecond). This sets how often a SysTick interrupt occurs. In depth, RTOS ticking is implemented using timer hardware of the MCU.

To keep track of time. xTickCount variable is a key. For example, it is used for vTaskDelay(100).

RTOS tick, apart from incrementing the tick count, is used to trigger the context switch to the next potential task. 10. The tick ISR runs `xPortSysTickTimer()` 11. portDISABLE_INTERRUPTS() is turned on. 12. xTickCount++. Also, if xTaskIncrementTick() return value is equal to TRUE if actually context switch is required 13. Checks to see if the new tick value will cause any tasks to be unblocked. 14. Determines which is the next potential task to run. All the ready state tasks are scanned If found, triggers the context switching by pending the PendSV interrupt 15. portENABLE_INTERRUPTS() is turned on.

The PendSV handler takes care of switching out of old task and switching in of new task
Let's go to `port.c` and see xPortSysTickHandler.

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

First, it increments the tick. In this example, let's say CPU clock frequency is set to 16MHz and `configTICK_RATE_HZ` is set to 1000Hz. "Clock" means the processor generates a pulse to perform basic operations at the speed of $16 \times 10^6$ times per second. By the same token, the tick occurs 1000 times every second.

Now the "load register" of SysTick (i.e. "SysTick Reload Value Register", `portSYSTICK_NVIC_LOAD_REG`) stores the value that will be loaded into the counter. It will count from certain value X down to 0 every 1 second.

$$ X = 16 \times 10^6 \div 1,000 = 16,000$$

As the SysTick timer starts, it counts down from 15,999 to 0. It generates an interrupt when the count value reaches 0 and again reloads the load count value. Therefore, 15,999 is the initial SysTick load value required to generate interrupt for every 1ms.

## References

[^1]: https://www.freertos.org/Documentation/01-FreeRTOS-quick-start/01-Beginners-guide/03-Build-your-first-project

[^2]: https://www.techtarget.com/whatis/definition/context-switch

[^3]: https://www.freertos.org/Documentation/02-Kernel/05-RTOS-implementation-tutorial/02-Building-blocks/03-The-RTOS-tick
