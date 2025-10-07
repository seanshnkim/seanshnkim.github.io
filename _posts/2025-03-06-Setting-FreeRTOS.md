---
layout: post
title: Part 1. How to Set FreeRTOS in Your Project
date: 2025-10-03 21:50:31
description:
tags:
categories:
  - RTOS
---

## FreeRTOS?

- FreeRTOS is a lightweight real-time operating system (RTOS) for embedded systems.
- Although FreeRTOS has been managed by AWS since 2017, it is fully open-source.
- There are other RTOS such as Keil RTX (ARM), Zephyr (Linux Foundation), and they are both free and open-source RTOS.
- There are commercial RTOSes such as VxWorks (Aptiv, Wind River Systems), embOS (SEGGER), Azure RTOS (Microsoft), Neutrino (BlackBerry).
- But overall, FreeRTOS is considered the most popular and widely used RTOS!

### 1. Download FreeRTOS

FreeRTOS is light. Its size is only about 90MB (100MB with documents included).
Download Link: https://www.freertos.org

### 2. I use FreeRTOS V11, but lecture uses V10

For this project, I use the latest version FreeRTOS (V11.1.1). However, the lecture uses previous version (v2020.12.00-LTS, or presumably V10.4.3).

FreeRTOS version was upgraded from V10 (V10.6.2) to V11 (V11.0.0) on December 2023. The main difference between two is that FreeRTOS V11.0.0 supports Symmetric Multiprocessing (SMP). But there are a lot more changes. You can look into the details [here](https://freertos.org/Documentation/04-Roadmap-and-release-note/02-Release-notes/00-Release-history#changes-between-freertos-v1062-and-freertos-v1100-released-december-18-2023).[^1]

If you are using a different version of FreeRTOS, the file structure may be different as well.

## Before RTOS, there is CMSIS

### What is CMSIS?

CMSIS, or Common Microcontroller Software Interface Standard is another part of software, but a software for special (and essential) purposes. It provides interfaces to processors, peripherals, real-time operating systems, and middleware components. It also defines generic tool interfaces, enables consistent device support and includes pre-written functions and libraries. Here are several components of CMSIS:

- Core (for ARM Cortex M-processors): APIs to control processor core and peripherals
- RTOS APIs:
- Driver

### CMSIS-RTOS API?

CMSIS-RTOS API layer is a _generic and standardized_ RTOS interface for ARM Cortex M-processor-based devices. It means you can use the same APIs in CMSIS-RTOS to leverage whatever RTOS you are using. Real-Time OS can vary: FreeRTOS, Keil RTX (RTX5) or Zephyr is each different type of RTOS. You can access different OS kernels with the same API, CMSIS-RTOS API.

| CMSIS-RTOS API Layer                                                                            | FreeRTOS Layer                                              |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| API provided by CMSIS-RTOS API layer to create an RTOS task (independent of an underlying RTOS) | Actual API provided by FreeRTOS to create a task (specific) |
| e.g. `osThreadCreate()`                                                                         | e.g. `vTaskCreate()`                                        |

### CMSIS-CORE Layer?

It implements basic run-time system for a Cortex-M device and gives the user access to the processor core and the device peripherals.[^2]

## Manually add FreeRTOS kernel to your project

To add FreeRTOS kernel into your project, you can use configuration tool provided STM32 Cube IDE. Go to 'Device Configuration Tool' > 'Middleware' > 'FREERTOS' > and choose 'CMSIS_V1' or 'CMSISV2'.

But it is better to manually add FreeRTOS kernel into your project.

### 1. Add FreeRTOS Generic Source Code

Target: FreeRTOS generic kernel source codes that are located in : `FreeRTOS > FreeRTOS-Kernel`

- croutine.c
- event_groups.c
- list.c
- queue.c
- stream_buffer.c
- tasks.c
- timers.c

Destination: Inside `Your-Project > ThirdParty > FreeRTOS`

### 2. Add device specific code

Because I am using STM32F429 (or STM32F407), I will choose `ARM_CM4F` for ARM Cortex-M4 processor. But if you have other types of devices you have to choose the corresponding type.

Target: Header and source code files located in: `FreeRTOS > FreeRTOS-Kernel > portable > GCC > ARM_CM4F`

- port.c: Implementation of functions defined in portable.h for the ARM CM4F port.
- portmacro.h: Port specific definitions.

Destination: `Your-Project > ThirdParty > FreeRTOS > portable > GCC > ARM_CM4F`

There are multiple source code files for heap management in FreeRTOS. In `portable > GCC > MemMang`, you can see the following files:

- heap_1.c
- heap_2.c
- heap_3.c
- heap_4.c
- heap_5.c

To build project with no error, you have to keep ONLY ONE file. Keep `heap_4.c`, and delete rest of the files.

### 3. Include paths in project build configuration

Include the following paths to the list of **(C/C++ Build) GCC compiler** paths:

- `ThirdParty/FreeRTOS`: This is for `FreeRTOSConfig.h` (explained below)
- `ThirdParty/FreeRTOS/include`: Header files for FreeRTOS generic kernel source code
- `ThirdParty/FreeRTOS/portable/GCC/ARM_CM4F`: Header files for processor specific (portable)

## Customize FreeRTOS configuration

### What is `FreeRTOSConfig.h` for?

FreeRTOS also needs customization for each application. And a file named `FreeRTOSConfig.h` takes the job. For example, we can set tick rate or configure task scheduling policy to preemptive scheduling in `FreeRTOSConfig.h`.

> FreeRTOS is customized using a configuration file called FreeRTOSConfig.h. Every FreeRTOS application must have a FreeRTOSConfig.h header file in its pre-processor include path. FreeRTOSConfig.h tailors the RTOS kernel to the application being built. It is therefore specific to the application, not the RTOS, and should be located in an application directory, not in one of the RTOS kernel source code directories.[^3]

There are some processor-dependent variables like `configKERNEL_INTERRUPT_PRIORITY`. That is why it is NOT recommended to re-use a `FreeRTOSConfig.h` file (without any modification) for projects with different processor architecture.

`FreeRTOSConfig.h` file is unprovided by default. Then where should we start? It must be very difficult to start from scratch. Fortunately, we can use a template file.

### How to get `FreeRTOSConfig.h` template

There are two ways to get the template:

1. In `FreeRTOS > FreeRTOS-Kernel > examples > template_configuration`, there is a basic template file.
2. Or you can find a processor-specific file in demo projects In github.com/FreeRTOS/FreeRTOS/tree/main/FreeRTOS/Demo, find a right demo project (in my case it's `CORTEX_M4F_STM32F407ZG-SK`) and copy the file out of it.

### Changes in source code `FreeRTOSConfig.h`

There is still more left to do.
If you just try building the project without any change in `FreeRTOSConfig.h`, you will see an error mentioning `SystemCoreClock`. The variable is actually defined in the code (`FreeRTOSConfig.h`) within the preprocessor. `__ICCARM__` is a macro for identifying the compiler for ARM processors[^4]. We are using GCC (GNU Compiler Collection) compiler for this project. We need to add compiler macros in this part of `FreeRTOSConfig.h`:

```c
// Previous
#ifdef __ICCARM__
	#include <stdint.h>
	extern unint32_t SystemCoreClock;
#endif

// Changed
#ifdef (__ICCARM__) || defined(__GNUC__) || defined(__CC_ARM)
	#include <stdint.h>
	extern unint32_t SystemCoreClock;
#endif
```

### Remove duplicates

1. Exclude `Core > Source > sysmem.c` from build. `sysmem.c` manages heap memory, but this is already taken care by FreeRTOS. We do not want duplicates, so let's exclude it from build.
2. In `stm32f4xx_it.c` , there is a function named `SVC_Handler()`. In `port.c`, there is also a function `vPortSVCHandler` and it defines a macro to use `vPortSVCHandler` as `SVCHandler`. Either one should be removed, because there must be only one definition for the same function within the entire project.
3. Instead of finding out duplicate function definitions and removing them manually, we can address this issue using code generation configuration in STM32 Cube IDE. Activate (click) project configuration file (ends with `.ioc`) and go to `System Core > NVIC > Code Generation`. Uncheck the following check boxes for 'Generate IRQ handler'. And then, generate the project code (`Project > Generate Code`)
   - Pendable request for system service
   - Time base: System tick timer
   - System service call via SWI instruction

Make all these variables from 1 to 0:

- configUSE_TICK_HOOK
- configUSE_MALLOC_FAILED_HOOK
- configCHECK_FOR_STACK_OVERFLOW

### Timebase source selection

- FreeRTOS uses ARM Cortex Mx processor's internal systick timer as its time base (RTOS ticking).
- STM32 Cube HAL layer also by default uses systick timer as its time base source.
- If you are using both FreeRTOS and STM32 Cube HAL layer in your project, there will be a conflict to use a timebase source.
- To resolve this, it is strongly recommended to use STM32 Cube HAL layer timebase source other than systick timer (use any timer peripheral of the microcontroller)
- That means you dedicate the SysTick timer only for FreeRTOS, and for STM32 Cube HAL layer you can use any of the timer peripheral of the microcontroller as time base source.

Go to the project .ioc file and choose SysTick as timebase source: `SYS > Timebase Source > SysTick` and then choose `TIM6` as its timebase source. After then, click `Project > Generate Code`. You will see a newly generated source code file `stm32f4xx_hal_timebase_tim.c`.

### NVIC Priority Setting

Go to the project .ioc file and choose `4 bits for pre-emption priority 0 bits for subpriority`: `NVIC > Code Generation > Priority Group`.

## References

[^1]: https://freertos.org/Documentation/04-Roadmap-and-release-note/02-Release-notes/00-Release-history#changes-between-freertos-v1062-and-freertos-v1100-released-december-18-2023

[^2]: https://arm-software.github.io/CMSIS_5/Core/html/index.html

[^3]: https://www.freertos.org/Documentation/02-Kernel/03-Supported-devices/02-Customization#:~:text=processor%20include%20path.-,FreeRTOSConfig.,RTOS%20kernel%20source%20code%20directories.

[^4]: https://stackoverflow.com/questions/17572519/what-do-the-cc-arm-iccarm-gnuc-and-tasking-macros-mean
