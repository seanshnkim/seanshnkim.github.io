---
layout: post
title: Semaphore vs. Mutex
date: 2025-02-12 21:02:37
description: 
tags:
  - semaphore
  - mutex
  - priority-inheritance
  - task-scheduling
categories: RTOS, OperatingSystem
---

## Key words

task, shared resource, wait, release, task synchronization

## What is semaphore?

In operating systems, semaphore is defined as an integer variable to handle task scheduling.
There are two types of semaphores: **binary semaphore** and **counting semaphore**.

### Binary semaphore

<figure class="mt-5">
    {% include figure.liquid loading="eager" path="assets/post-attachments/Semaphore/binary-semaphore.png" class="img-fluid rounded z-depth-1 center-image" width="300px" %}
</figure>

"Binary" semaphores have a value of either 0 or 1. Because they behave similarly to mutex, it can be confusing. We will discuss the difference between the two later.

Binary semaphores are implemented through `xSemaphoreCreateBinary()` method.

```c
SemaphoreHandle_t xSemaphoreCreateBinary( void );
```

I strongly recommend you to read through FreeRTOS official document[^1].


### Counting semaphore

<figure class="mt-5">
    {% include figure.liquid loading="eager" path="assets/post-attachments/Semaphore/counting-semaphore.png" class="img-fluid rounded z-depth-1 center-image" width="300px" %}
</figure>

## What is mutex?

As the word "mutex" implies, it provides mutual exclusion for multiple tasks. However, it is different from semaphores in that it acts as a **lock**. Mutex also claims ownership of the lock, while semaphore does not.

<figure class="mt-5">
    {% include figure.liquid loading="eager" path="assets/post-attachments/Semaphore/mutex-illustration.png" class="img-fluid rounded z-depth-1 center-image" width="700px" %}
</figure>

## What are differences?

Semaphores, like mutex locks, can be used to provide mutual exclusion. Whereas a mutex lock has a binary value that indicates if the lock is available or not, a semaphore has an integer value and can therefore be used to solve a variety of synchronization problems.

## References

- https://www.freertos.org/Documentation/02-Kernel/04-API-references/10-Semaphore-and-Mutexes/00-Semaphores
- https://www.geeksforgeeks.org/mutex-vs-semaphore/

[^1]: https://www.freertos.org/Documentation/02-Kernel/04-API-references/10-Semaphore-and-Mutexes/01-xSemaphoreCreateBinary