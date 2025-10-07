---
layout: post
title: Why does it display white screen after removing SysTick_Handler?
date: 2025-10-06 16:17:30
description:
tags:
categories:
---

## What happens if there is no `stm32f4xx_it.c`?

If you tested the [program](https://github.com/seanshnkim/Simple-Print-LCD) without `stm32f4xx_it.c`, you won't get error, but you will see only white screen. Why?

In my `stm32f4xx_it.c`, there is only one function with actual declaration:

```c
void SysTick_Handler(void)
{
  HAL_IncTick();
}
```

Now, try building and uploading the program with `stm32f4xx_it.c` but the `SysTick_Handler` part commented out. Although `stm32f4xx_it.c` exists, it still displays white screen.
Now we know `SysTick_Handler` is the matter.

## What does `SysTick_Handler` do?

In the code above, `SysTick_Handler` does one job: call `HAL_IncTick()`. `HAL_IncTick` increments a global variable "uwTick" used as application time base. Without it, it will somehow block display on screen.

> The HAL and many library functions rely on the SysTick interrupt for the system tick (HAL tick). In the HAL implementation, SysTick increments the millisecond counter via `HAL_IncTick()` and this is what makes `HAL_Delay()` and other timing functions work.

In short, `SysTick_Handler()` is invoked every time `HAL_Delay()` is called.

Let's look at `main.c`, line 249:

```c
// Line 249
void LCD_Init(void)
{
    HAL_Delay(120);

    // Software reset
    LCD_WriteCommand(0x01);
    HAL_Delay(120);
    // ...
```

And in line 74:

```c
// line 74
while (1) {
	// LED blink pattern depends on clock source
	if (clock_source == 0) {
		// HSE: fast double blink
		HAL_GPIO_WritePin(GPIOG, GPIO_PIN_13, GPIO_PIN_SET);
		HAL_Delay(100);
		HAL_GPIO_WritePin(GPIOG, GPIO_PIN_13, GPIO_PIN_RESET);
		HAL_Delay(100);
		HAL_GPIO_WritePin(GPIOG, GPIO_PIN_13, GPIO_PIN_SET);
		HAL_Delay(100);
		HAL_GPIO_WritePin(GPIOG, GPIO_PIN_13, GPIO_PIN_RESET);
		HAL_Delay(700);
		// ...
```

As seen, `HAL_Delay()` is everywhere.
And if you debug it, you can see in the call stack:

{% include figure.liquid loading="eager" path="assets/post-attachments/2025-10-06/stm32f4xx_it call stack.png" class="img-fluid rounded z-depth-1" width="300px" %}

that somehow `SysTick_Handler` is invoked by `HAL_Delay`.

Now it's more clear. If `SysTick_Handler` not defined, it will prevent `HAL_Delay` from operating normally, and that's probably why we can only see the blank screen. But how does it work in detail? Or before, if `SysTick_Handler` plays such a crucial role, how did it even build and run the program without it?

## Startup File has a weak symbol to SysTick_Handler

Let's go into `~/.platformio/packages/framework-cmsis-stm32f4/Source/Templates/gcc`.
There is a file named `startup_stm32f429xx.s`.

In line 143:

```asm
.word SysTick_Handler
```

And in line 272-273:

```asm
   .weak      SysTick_Handler
   .thumb_set SysTick_Handler,Default_Handler
```

- Line 272: places the value (address) of the symobl `SysTick_Handler` in the vector table.
- Line 273: `SysTick_Handler` will be resolved to a weak alias "Default_Handler".

Thanks to this startup file, the program does not return error even if there is no `SysTick_Handler` explicitly defined by user. It will instead implicitly link `SysTick_Handler` to a weak alias, which is `Default_Handler`. What does `Default_Handler` do?

In line 112 of the same startup file:

```asm
Default_Handler:
Infinite_Loop:
  b  Infinite_Loop
  .size  Default_Handler, .-Default_Handler
```

It runs an infinite loop. Now everything seems clear!

When stm32f4xx_it.c was removed, there was no explicit `SysTick_Handler` defined, thus the compiler linked `SysTick_Handler` to its weak alias `Default_Handler`, and `Default_Handler` ran an infinite loop, which made the program stuck in `HAL_Delay()` forever.

Now, when you define your own SysTick_Handler, the program will refer to the strong link of `SysTick_Handler` and increment tick correctly. On the other hand, if you don't define it, it won't return any compile error because it refers to the weak link of `SysTick_Handler`, which is aliased to `Default_Handler`, but `Default_Handler` does not do anything except infinitely running a loop. That is why you only see blank white screen.

### Summary

1. When you define your own SysTick_Handler, the program will refer to the strong link of `SysTick_Handler` and increment tick correctly.
2. On the other hand, if you don't define it, it won't return any compile error because it refers to the weak link of `SysTick_Handler`, which is aliased to `Default_Handler`.
3. But `Default_Handler` doesn't do anything except infinitely running a loop. This is why you only see blank white screen.

### What is startup file for?

> The startup file sets up the [vector table](https://www.google.com/search?client=safari&sca_esv=263a33c192532136&cs=0&sxsrf=AE3TifMi8Zc-uHnpSjsBAVV1blpNEvPqSQ%3A1759780763989&q=vector+table&sa=X&ved=2ahUKEwjZz_uZrpCQAxUwElkFHcaGDVMQxccNegQIEhAB&mstk=AUtExfDd4nCCmgGH8VzBeL6StnFrEjFstE4jNvObayDpJ-kDwUDN7Bk-raYNEOxeXjJkBjcI4OZsw0T8DZ0vbggKn7UJLZsemwPP5ATiusfmLSt7pw5mzlagh3CeMEy7Y67gllLOEX8pXjyqPXwG4XEIOk8UBCez5XQR5yVknmVvGZ5JTvKxvZZVJndluirce5zHcI1VCod6MkHekpSi3OK6eRRRQ8gn581plGguRWeXsrkrx8QhyvGHl-7LihTUDy3Z-nKrqQxPXJINPL7Mjcdt2npEy7gFglQosNouT1C3RqF11g&csui=3), which is an array of pointers. This table tells the processor the memory addresses of the [interrupt service routines](https://www.google.com/search?client=safari&sca_esv=263a33c192532136&cs=0&sxsrf=AE3TifMi8Zc-uHnpSjsBAVV1blpNEvPqSQ%3A1759780763989&q=interrupt+service+routines&sa=X&ved=2ahUKEwjZz_uZrpCQAxUwElkFHcaGDVMQxccNegQIIRAB&mstk=AUtExfDd4nCCmgGH8VzBeL6StnFrEjFstE4jNvObayDpJ-kDwUDN7Bk-raYNEOxeXjJkBjcI4OZsw0T8DZ0vbggKn7UJLZsemwPP5ATiusfmLSt7pw5mzlagh3CeMEy7Y67gllLOEX8pXjyqPXwG4XEIOk8UBCez5XQR5yVknmVvGZ5JTvKxvZZVJndluirce5zHcI1VCod6MkHekpSi3OK6eRRRQ8gn581plGguRWeXsrkrx8QhyvGHl-7LihTUDy3Z-nKrqQxPXJINPL7Mjcdt2npEy7gFglQosNouT1C3RqF11g&csui=3) (ISRs) and exception handlers, enabling the MCU to respond to hardware interrupts and errors.

It's worthwhile to read this article: https://microdigisoft.com/understanding-the-boot-process-and-startup-file/

### References

In fact, this must have been quite a common bug for those using `HAL_Delay()` method in their program:

- https://stackoverflow.com/questions/46062122/delay-in-hal-library-hal-delay
- https://community.st.com/t5/stm32-mcus-products/hal-delay/td-p/62617

These are very good articles explaining how `SysTick_Handler` works:

1. https://community.platformio.org/t/stm32-hal-project-dependent-on-definition-location-of-systick-handler-in-an-unexpected-way/38620
2. https://community.st.com/t5/stm32-mcus-products/understanding-systick-handler/td-p/345143
