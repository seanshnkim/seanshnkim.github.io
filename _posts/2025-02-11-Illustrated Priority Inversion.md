---
layout: post
title: Illustrated Priority Inversion
date: 2025-02-11 12:38:07
description: 
tags:
  - priority
  - inversion
categories: RTOS
thumbnail: _posts/attachments/task_table.png
---


## What is Priority Inversion?

The definition of priority inversion is well-explained in Wikipedia:

> High priority task is indirectly preempted by a low (or medium) priority task.

This should not happen because it is literally a "high priority" task which indicates that it should be executed before all the other lower priority tasks. In other words, priority inversion is a problematic situation and we have to prevent it.

I will first demonstrate the concept with analogy and then with a simple program in C. Lastly, I will discuss solutions to priority inverison.

## Real-world Analogy of Priority Inversion

Assume there are three different tasks:

- High priority task (i.e. "HP Task")
- Medium priority task (i.e. "MP Task")
- Low priority task (i.e. "LP Task")

If there is no problem with a scheduler then HP Task should always be executed first, MP Task next, and at last LP Task.

But then there is a "critical section". Critical section is a part of a program or hardware that accesses a shared resource. Only one process (task) is allowed to access the critical section at one time. [Wikipedia: Critical Section](https://en.wikipedia.org/wiki/Critical_section)

In this example, three different characters represent each task:

- HP Task = "Harry"
- MP Task = "Mary"
- LP Task = "Larry"

### Prerequisites

Before walking through the example, there are some prerequisites to keep in mind:

1. Only one person can stay in the house. This is because the processor core cannot accept more than one task.

![[single_thread1.png]]

1. Once a person starts using a pot, it cannot be interrupted or taken by other person until he is done with using it (even if the highest priority task requests using it!)

![[critical_section1.png]]

### 1. LP Task starts first

Let's start with Larry. Larry came home in the first place and decided to prepare breakfast for tomorrow. He uses a pot (critical section) in the kitchen. This is the only pot in the kitchen, so unless he is finished no one else can use it. We would assume that making breakfast for tomorrow is not urget, so it is a low priority task.

![[d1.png]]

![[d2.png]]

### 2. HP Task "tries to" preempt LP Task

While Larry is cooking her food, Harry comes home (Remember, Harry cannot enter home right away. He would have to wait in front of the door).

![[d3.png]]

### 3. HP Task is blocked

Because Harry needs to eat lunch before the class, and he was going to make pasta. (Pasta needs a pot to boil it) Harry shouts to the kitchen, "I need to cook!" Obviously Harry's task has higher priority, but he cannot take away Larry's pot. That's why Harry has to wait in front of the house, not being able to start cooking ("**blocked**" state).

![[d4.png]]

### 4. MP Task preempts LP Task

Afterwards, Mary comes in. Mary came home to clean the house, because she has a guest coming in the evening. This task priority is higher than cooking for tomorrow, but less than Harry's. But because she is not using the pot, and because her task has higher priority than Larry's she enters home and kicks out Larry.

![[d5.png]]

![[d6.png]]

Now, Harry is frustrated. His task was the most urgent one, but turns out that Mary is now in the house instead!

![[task_table.png]]

<div class="row mt-3">
  <div class="col-sm mt-3 mt-md-0">
    {% include figure.liquid loading="eager" path="_posts/attachments/d6.jpg" class="img-fluid rounded z-depth-1" %}
  </div>
  <div class="col-sm mt-3 mt-md-0">
    {% include figure.liquid loading="eager" path="_posts/attachments/7.jpg" class="img-fluid rounded z-depth-1" %}
  </div>
</div>
<div class="caption">
  A simple, elegant caption looks good between image rows.
</div>

<div class="row mt-3">
  <div class="col-sm mt-3 mt-md-0">
    {% include figure.liquid loading="eager" path="_posts/attachments/8.jpg" class="img-fluid rounded z-depth-1" zoomable=true %}
  </div>
  <div class="col-sm mt-3 mt-md-0">
    {% include figure.liquid loading="eager" path="_posts/attachments/10.jpg" class="img-fluid rounded z-depth-1" zoomable=true %}
  </div>
</div>

## Why does priority inversion matter in RTOS?

In RTOS, it is crucial to schedule tasks so that they have a certain limit of deadline. The priority of each task must be carried out in order.

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

- https://en.wikipedia.org/wiki/Priority_inversion
- https://www.embedded.com/how-to-use-priority-inheritance/
- https://www.foxipex.com/2024/11/08/priority-inversion-and-priority-inheritance-in-freertos/
- https://www.highintegritysystems.com/downloads/RTOS_Tutorials/Priority_Inversion.pdf
- https://www.freertos.org/Documentation/02-Kernel/02-Kernel-features/02-Queues-mutexes-and-semaphores/04-Mutexes
- https://www.geeksforgeeks.org/difference-between-priority-inversion-and-priority-inheritance/
