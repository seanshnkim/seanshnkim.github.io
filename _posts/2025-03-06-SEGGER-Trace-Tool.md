---
layout: post
title: How to Use SEGGER Trace Tool for Debugging
date: 2025-03-06 14:51:20
description:
tags:
  - Trace-Tool
  - SEGGER
categories:
  - RTOS
---

## What is SEGGER SystemView, and why do we need it?

If you are using STM32 devices for a embedded project, you'd probably be using STM32 Cube IDE. 그리고 이걸로도 프로그램 디버깅이 가능하다. 하지만 만약 이런 걸 하고 싶다면 어떻게 하겠는가?

- Track and visualize multiple events in run-time
- CPU load analysis
- Record data in real-time and debug in more depth

이런 기능은 STM32 Cube IDE에서 제공해주지 않는다. SEGGER SystemView 프로그램의 인터페이스가 어떤지 보면 더 감이 잡힐 것이다.

이렇듯이 SEGGER SystemView는 IDE만으로는 충족되지 않는 한층 더 심층적인 이해를 제공한다. 프로그램에서 실행되고 있는 각 이벤트와 시간, CPU load 등의 정보를 더 직관적으로 이해할 수 있다. 게다가 더 좋은 사실은, 공짜라는 거다! (상업적인 목적으로만 사용하지 않는다면) 즉, 디버깅을 넘어선 분석을 도와주는 것이다. 이 프로그램에 대해서 더 궁금하다면 [매뉴얼](https://www.segger.com/downloads/systemview/UM08027) 13 페이지를 읽어보자.[^2]

안타깝게도 SEGGER SystemView는 STM32 Cube IDE에 포함되어 있지 않다 (서로 다른 회사이기 때문에).

원하는 타겟 프로그램에 SEGGER SystemView로 디버깅 결과를 보려면 약간은 번거롭지만 코드도 추가해야 하고 설정 세팅을 해주어야 한다.

다행히도 또 SEGGER는 FreeRTOS를 지원해준다.

SEGGER SystemView에 대해서 궁금하다면 여기에 설명이 더 자세히 나와있다

## 1. Install SEGGER SystemView

SEGGER [공식 홈페이지](https://www.segger.com/downloads/systemview/)에 가면 프로그램을 다운로드 받을 수 있다:

- SEGGER SytemView installer

하지만 프로그램만 다운로드 받는다고 되는 게 아니다. 문제는 코드도 다운로드 받아야 한다. 이 코드를 target embedded 프로그램 안에 삽입해야 분석하기 위한 데이터를 수집할 수 있기 때문이다.

- SEGGER SytemView target sources

실제로 본인이 MCU에서 작동시키고자 하는 프로그램에서 원하는 event (target event)를 수집하고자 한다면 이 코드를 프로그램에 넣어야 한다. (그림 필요할 듯)

Linux의 경우 설치 후 아무 문제 없이 바로 작동이 되었다.
반면 Windows의 경우 이런 에러가 발생할 수 있다:

`The code execution cannot proceed because msvcp140.dll..`

그러면 이 [링크](https://answers.microsoft.com/en-us/windows/forum/all/error-message-for-msvcp140dll-and-vcruntime140dll/8c2c0803-08ac-4275-838e-b692077b5c9e)대로 Microsoft Visual C++를 설치해주면 된다. 설치 파일도 방금 언급한 링크에서 확인할 수 있다. 설치했더니 바로 이상없이 SystemView가 작동하는 걸 확인할 수 있었다[^1].

## 2. Include SEGGER target sources

### 2-1. What are the target sources to include?

These are the codes to include:

Including SystemView in the Application

(그림)

ThirdParty > SEGGER 폴더를 생성 후 아래 총 4개의 폴더를 생성한다 (FreeRTOS v11 이상을 사용하고 있다면 Patch 폴더와 파일은 필요없다)

- Config
- OS
- Patch
- SEGGER

Be careful that `_SEGGER_SYSVIEW_Config_[SYSTEM].c_` source code file is in `Sample > TARGET_OS > Config > ...` but should be included in `ThirdParty > SEGGER > Config` folder in the host workspace.

### 2-2. Include path in project build configuration

Include the following paths to the list of **(C/C++ Build) GCC compiler** paths:

- `ThirdParty/SEGGER/Config`
- `ThirdParty/SEGGER/OS`
- `ThirdParty/SEGGER/SEGGER`

For `SEGGER_RTT_ASM_ARMv7M.S` file (this file has optimized RTT routines for Cortex-M[^5]), include the path `ThirdParty/SEGGER/Config` to **MCU GCC Assemble**r paths.

- `ThirdParty/SEGGER/Config`

### 2-3. FreeRTOS Configuration

SEGGER_SYSVIEW_FreeRTOS.h header has to be included at the end of FreeRTOSConfig.h or above every include of FreeRTOS.h.

Also, add (or change) these macros in FreeRTOSConfig.h:

```c
#define INCLUDE_xTaskGetIdleTaskHandle 1
#define INCLUDE_pxTaskGetStackStart 1
```

### 2-4. MCU and project specific settings

In SEGGER_SYSVIEW_Conf.h, set:

`SEGGER_SYSVIEW_CORE_OTHER.h -> SEGGER_SYSVIEW_CORE_CM3`

In SEGGER_SYSVIEW_ConfDefaults.h,
Set `SEGGER_SYSVIEW_RTT_BUFFER_SIZE` to a proper size (in this project, I set it to `(1024 * 4)`. )

### 2-5. Enable ARM Cortex M3/M4 Cycle Counter

This is required to maintain the time stamp information of application events. SystemView will use the Cycle counter register value to maintain the time stamp information of events.

`DWT_CYCCNT` register of ARM Cortex Mx processor stores number of clock cycles that have been happened after the reset of the Processor.

_DTW stands for "Data Watch and Trace Unit"._[^3]

By default this register is disabled.

This is DWT_CTRL register map:[^4]

https://documentation-service.arm.com/static/5f8fedcbf86e16515cdbf28b?token=

For now, we are only interested in enabling `CYCCNTENA` bit.

- 0 = Disabled
- 1 = Enabled

The address of `DWT_CTRL` is known as 0xE0001000.

So add this line into `main.c`:

```c
#define DWT_CTRL (*(volatile uint32_t*) 0xE0001000)
```

And add this line into main loop:

```c
DWT_CTRL |= (1 << 0);
```

### 2-6. Configure and start recording by calling SEGGER APIs

```c
// In main.c:
// ...
SEGGER_SYSVIEW_Conf();
// ...
SEGGER_SYSVIEW_Start();
```

<div class="image-row">
  <figure class="mt-3">
    {% include figure.liquid loading="eager" path="assets/post-attachments/Scheduler/tick_1.png" class="img-fluid rounded z-depth-1" width="150px" %}
  </figure>
  <figure class="mt-3">
    {% include figure.liquid loading="eager" path="assets/post-attachments/Scheduler/tick_2.png" class="img-fluid rounded z-depth-1" width="500px" %}
  </figure>
</div>

## 3. Two types of recording

SEGGER SytemView supports two types of recording:

- Continuous recording: Real-Time Transfer (RTT) technology. Uses ST-Link circuitry.
- Single-shot recording: record data until its target buffer is filled.

각 방식은 작동하는 방식도 다르고 돌아가는 코드도 약간 다르다.

## 4. How to record

- For UART recording, select the COM Port the target is connected to.

## References

[^1]: https://www.segger.com/products/development-tools/systemview/

[^2]: https://www.segger.com/downloads/systemview/UM08027

[^3]: https://developer.arm.com/documentation/ddi0403/d/Debug-Architecture/ARMv7-M-Debug/The-Data-Watchpoint-and-Trace-unit

[^4]: https://developer.arm.com/documentation/ddi0403/d/Debug-Architecture/ARMv7-M-Debug/The-Data-Watchpoint-and-Trace-unit/Control-register--DWT-CTRL

[^5]: p.17, SEGGER SystemView User Guide UM08027
