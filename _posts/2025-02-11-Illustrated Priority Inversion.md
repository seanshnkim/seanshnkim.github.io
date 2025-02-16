---
layout: post
title: Illustrated Priority Inversion
date: 2025-02-11 12:38:07
description:
tags:
  - priority-inversion
categories: RTOS
thumbnail: assets/post-attachments/task_table.png
---

## What is Priority Inversion?

According to Wikipedia:

> ... High priority task is indirectly preempted by a low (or medium) priority task. [^1]

In RTOS, this should not occur. A "high priority" task indicates it must be executed before all other lower priority tasks. However, surprisingly, such situations can arise despite pre-set priorities. Yes, priority inversion is a **problematic situation** and it must be prevented.

In this post, I will:

1. Demonstrate the concept of priority inversion using an analogy for better understanding.
2. Guide you through a simple C program to show how priority inversion actually works in code.

## Real-world Analogy of Priority Inversion

Imagine there are three different tasks trying to run on a single processor:

- High priority task (HP Task)
- Medium priority task (MP Task)
- Low priority task (LP Task)

In an ideal scenario, the scheduler would always execute these tasks in the right order: HP Task -> MP -> LP Task.

But then the situation gets complicated as a "critical section" is introduced. Critical section is a part of a program or hardware that accesses a shared resource. Only one process (task) is allowed to access the critical section at one time. [^2]

In our analogy, I created three characters each representing a task:

- HP Task = "Harry"
- MP Task = "Mary"
- LP Task = "Larry"

### Prerequisites

Before we continue, keep in mind:

1. Only one person can stay in the house at a time. This is because the processor core (in embedded systems) cannot handle more than one task simultaneously.

<figure class="mt-5">
    {% include figure.liquid loading="eager" path="assets/post-attachments/single_thread1.png" class="img-fluid rounded z-depth-1 center-image" width="350px" %}
</figure>

2. Once someone starts using the pot (critical section), they cannot be interrupted until they are done, even by a higher priority task.

<figure class="mt-5">
    {% include figure.liquid loading="eager" path="assets/post-attachments/critical_section1.png" class="img-fluid rounded z-depth-1 center-image" width="600px" %}
</figure>

### Scenario 1. LP Task starts first

Let's start with Larry. Larry enters the house and begins cooking breakfast for tomorrow using the only post in the kitchen. Since making breakfast for tomorrow is not that urgent, it can be considered a low priority task.

<div class="image-row">
  <figure class="mt-3">
    {% include figure.liquid loading="eager" path="assets/post-attachments/d1.png" class="img-fluid rounded z-depth-1" width="300px" %}
  </figure>
  <figure class="mt-3">
    {% include figure.liquid loading="eager" path="assets/post-attachments/d2.png" class="img-fluid rounded z-depth-1" width="150px" %}
  </figure>
</div>

### 2. HP Task "tries to" preempt LP Task

While Larry is cooking her food, Harry arrives home. Remember, Harry cannot enter home instantly. He would have to wait in front of the door.

<figure class="mt-5">
{% include figure.liquid loading="eager" path="assets/post-attachments/d3.png" class="img-fluid rounded z-depth-1 center-image" width="300px" %}
</figure>

### 3. HP Task is blocked

Harry needs to cook pasta for lunch before class, but can't use the pot. Obviously Harry's task has a higher priority, but he cannot do anything. That's why Harry has to wait in front of the house, unable to start cooking ("**blocked**" state).

<figure class="mt-5">
    {% include figure.liquid loading="eager" path="assets/post-attachments/d4.png" class="img-fluid rounded z-depth-1 center-image" width="300px" %}
</figure>

### 4. MP Task preempts LP Task

Afterwards, Mary arrives to clean the house for an evening guest. Her task has higher priority than Larry's but lower than Harry's. Since she doesn't need the pot (this is important!), she is able to enter the house directly and kicks out Larry.

<div class="image-row">
  <figure class="mt-3">
    {% include figure.liquid loading="eager" path="assets/post-attachments/d5.png" class="img-fluid rounded z-depth-1" width="250px"%}
  </figure>
  <figure class="mt-3">
    {% include figure.liquid loading="eager" path="assets/post-attachments/d6.png" class="img-fluid rounded z-depth-1" width="300px"%}
  </figure>
</div>

How would Harry feel then? He must be baffled and frustrated!
His task is delayed even though it was the most urgent, while a medium-priority task is being executed now.

<figure class="mt-5">
{% include figure.liquid loading="eager" path="assets/post-attachments/task_table.png" class="img-fluid rounded z-depth-1 center-image" width="700px" %}
</figure>

## Why Priority Inversion Matters in RTOS

In RTOS, task scheduling within specific **deadline** is crucial. In fact, the term "**real-time**" itself implies completing tasks within **predetermined** time limits. Because priority inversion can lead to missed deadlines, it must be prevented especially for hard real-time applications.

Keywords:

- real-time
- deadline
- deterministic

## Demo

Here is source code that can be run in STM32F4xx device:

```c
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/semphr.h"

SemaphoreHandle_t mutex;

void lowPriorityTask(void *pvParameters) {
    while (1) {
        xSemaphoreTake(mutex, portMAX_DELAY);
        // Simulate work
        vTaskDelay(pdMS_TO_TICKS(2000));
        xSemaphoreGive(mutex);
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}

void mediumPriorityTask(void *pvParameters) {
    while (1) {
        // Simulate work
        vTaskDelay(pdMS_TO_TICKS(3000));
    }
}

void highPriorityTask(void *pvParameters) {
    while (1) {
        xSemaphoreTake(mutex, portMAX_DELAY);
        // Critical section
        xSemaphoreGive(mutex);
        vTaskDelay(pdMS_TO_TICKS(5000));
    }
}

void app_main() {
    mutex = xSemaphoreCreateMutex();
    xTaskCreate(lowPriorityTask, "Low", 2048, NULL, 1, NULL);
    xTaskCreate(mediumPriorityTask, "Medium", 2048, NULL, 2, NULL);
    xTaskCreate(highPriorityTask, "High", 2048, NULL, 3, NULL);
}
```

In the next post, I will discuss several solutions for priority inversion.

## References

- https://www.embedded.com/how-to-use-priority-inheritance/
- https://www.foxipex.com/2024/11/08/priority-inversion-and-priority-inheritance-in-freertos/
- https://www.highintegritysystems.com/downloads/RTOS_Tutorials/Priority_Inversion.pdf
- https://www.freertos.org/Documentation/02-Kernel/02-Kernel-features/02-Queues-mutexes-and-semaphores/04-Mutexes
- https://www.geeksforgeeks.org/difference-between-priority-inversion-and-priority-inheritance/

[^1]: [Wikipedia: Priority_Inversion](https://en.wikipedia.org/wiki/Priority_inversion)
[^2]: [Wikipedia: Critical Section](https://en.wikipedia.org/wiki/Critical_section)
