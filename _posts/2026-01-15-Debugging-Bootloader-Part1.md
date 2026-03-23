---
layout: post
title: "Debugging Bootloader: Part 1"
date: 2026-01-15 01:21:27
categories: Firmware
toc:
  beginning: true
  sidebar: left
---

In this post, I'll share the debugging process I went through in Phase 2. Looking at just the conclusion, the cause was really simple. But as with all debugging, you have no choice but to find the cause through trial and error. I think it's worth recording how I solved it.

## What's Wrong with the Code?

Given the bootloader and the application code, I flashed both files. However, it hung forever when jumping to the application.

```
========================================
    BOOTLOADER v1.0
========================================
Running at address: 0x08000661
Bootloader running...
Bootloader running... (LED blinks 3 times)
Attempting to jump to application...
Preparing to jump to application at 0x08010000...
  App Stack Pointer: 0x20030000
  App Entry Point:   0x08011711
Jumping to application NOW!
```

And there is no message from the application. Let's look at the code.

## Bootloader's `main.c`

Since I was working in STM32CubeIDE, I used the IDE's automatic code configuration feature when first writing the code. I configured my board (STM32F429I-DISC1) and set up the default peripheral modes to create the basic skeleton of main.c.

Then I added the following features:

- Redefined the `_write` function for printf output over UART
- Defined `jump_to_application`
- Init functions for `GPIO`, `TIM1`, `MX_USART1_UART`, and `SystemClock_Config`

```c
/* BOOTLOADER Core/Src/main.c
Copy and paste, running this code will not guarantee a normal build. This code only works in STM32CubeIDE with STM32F429I board
*/

void SystemClock_Config(void);
static void MX_GPIO_Init(void);
static void MX_TIM1_Init(void);
static void MX_USART1_UART_Init(void);

int _write(int file, char *ptr, int len)
{
    HAL_UART_Transmit(&huart1, (uint8_t*)ptr, len, HAL_MAX_DELAY);
    return len;
}

void jump_to_application(uint32_t app_address)
{
    printf("Preparing to jump to application at 0x%08lX...\r\n", app_address);

    // 1. Read the application's vector table
    //    First entry: Initial Stack Pointer
    //    Second entry: Reset Handler (entry point)
    uint32_t app_stack_pointer = *((__IO uint32_t*)app_address);
    uint32_t app_entry_point = *((__IO uint32_t*)(app_address + 4));

    printf("  App Stack Pointer: 0x%08lX\r\n", app_stack_pointer);
    printf("  App Entry Point:   0x%08lX\r\n", app_entry_point);

    // 2. Sanity check: Is the stack pointer valid?
    //    It should point to RAM (0x20000000 - 0x20030000 for STM32F429)
    if ((app_stack_pointer < 0x20000000) || (app_stack_pointer > 0x20030000))
    {
        printf("ERROR: Invalid stack pointer! Application may not be valid.\r\n");
        return;  // Don't jump to invalid application
    }

    printf("Jumping to application NOW!\r\n\r\n");
    HAL_Delay(100);  // Give UART time to send the message

    // 3. Disable interrupts
    __disable_irq();

    // 4. Deinitialize HAL (optional but good practice)
    HAL_RCC_DeInit();
    HAL_DeInit();

    // 5. Disable SysTick
    SysTick->CTRL = 0;
    SysTick->LOAD = 0;
    SysTick->VAL = 0;

    // 6. Set the vector table address to the application's vector table
    SCB->VTOR = app_address;

    // 7. Set the stack pointer to the application's initial stack pointer
    __set_MSP(app_stack_pointer);

    // 8. Jump to the application's reset handler
    void (*app_reset_handler)(void) = (void (*)(void))app_entry_point;
    app_reset_handler();

    // Should never reach here
    while (1);
}

int main(void)
{
  HAL_Init();
  SystemClock_Config();

  MX_GPIO_Init();
  MX_TIM1_Init();
  MX_USART1_UART_Init();

  printf("\r\n");
  printf("========================================\r\n");
  printf("    BOOTLOADER v1.0                    \r\n");
  printf("========================================\r\n");
  printf("Running at address: 0x%08lX\r\n", (uint32_t)&main);
  printf("Bootloader running...\r\n");
  printf("\r\n");

  // Blink LED a few times to show bootloader is running
  printf("Bootloader running... (LED blinks 3 times)\r\n");
  for (int i = 0; i < 3; i++)
  {
	HAL_GPIO_WritePin(GPIOG, GPIO_PIN_13, GPIO_PIN_SET);
	HAL_Delay(200);
	HAL_GPIO_WritePin(GPIOG, GPIO_PIN_13, GPIO_PIN_RESET);
	HAL_Delay(200);
  }

  printf("\r\n");
  printf("Attempting to jump to application...\r\n");
  HAL_Delay(500);  // Brief pause

  // Jump to application!
  jump_to_application(0x08010000);

  // If we reach here, jump failed
  printf("\r\n");
  printf("ERROR: Failed to jump to application!\r\n");
  printf("Staying in bootloader mode.\r\n");

  while (1)
  {
	  // Slow blink indicates bootloader fallback mode
	  HAL_GPIO_TogglePin(GPIOG, GPIO_PIN_13);
	  HAL_Delay(500);
  }
}

void SystemClock_Config(void)
{
  RCC_OscInitTypeDef RCC_OscInitStruct = {0};
  RCC_ClkInitTypeDef RCC_ClkInitStruct = {0};

  __HAL_RCC_PWR_CLK_ENABLE();
  __HAL_PWR_VOLTAGESCALING_CONFIG(PWR_REGULATOR_VOLTAGE_SCALE3);

  RCC_OscInitStruct.OscillatorType = RCC_OSCILLATORTYPE_HSE;
  RCC_OscInitStruct.HSEState = RCC_HSE_ON;
  RCC_OscInitStruct.PLL.PLLState = RCC_PLL_ON;
  RCC_OscInitStruct.PLL.PLLSource = RCC_PLLSOURCE_HSE;
  RCC_OscInitStruct.PLL.PLLM = 4;
  RCC_OscInitStruct.PLL.PLLN = 72;
  RCC_OscInitStruct.PLL.PLLP = RCC_PLLP_DIV2;
  RCC_OscInitStruct.PLL.PLLQ = 3;
  if (HAL_RCC_OscConfig(&RCC_OscInitStruct) != HAL_OK)
  {
    Error_Handler();
  }

  // Initializes the CPU, AHB and APB buses clocks
  RCC_ClkInitStruct.ClockType = RCC_CLOCKTYPE_HCLK|RCC_CLOCKTYPE_SYSCLK
                              |RCC_CLOCKTYPE_PCLK1|RCC_CLOCKTYPE_PCLK2;
  RCC_ClkInitStruct.SYSCLKSource = RCC_SYSCLKSOURCE_PLLCLK;
  RCC_ClkInitStruct.AHBCLKDivider = RCC_SYSCLK_DIV1;
  RCC_ClkInitStruct.APB1CLKDivider = RCC_HCLK_DIV2;
  RCC_ClkInitStruct.APB2CLKDivider = RCC_HCLK_DIV1;

  if (HAL_RCC_ClockConfig(&RCC_ClkInitStruct, FLASH_LATENCY_2) != HAL_OK)
  {
    Error_Handler();
  }
}


static void MX_TIM1_Init(void)
{
  TIM_ClockConfigTypeDef sClockSourceConfig = {0};
  TIM_MasterConfigTypeDef sMasterConfig = {0};

  htim1.Instance = TIM1;
  htim1.Init.Prescaler = 0;
  htim1.Init.CounterMode = TIM_COUNTERMODE_UP;
  htim1.Init.Period = 65535;
  htim1.Init.ClockDivision = TIM_CLOCKDIVISION_DIV1;
  htim1.Init.RepetitionCounter = 0;
  htim1.Init.AutoReloadPreload = TIM_AUTORELOAD_PRELOAD_DISABLE;
  if (HAL_TIM_Base_Init(&htim1) != HAL_OK)
  {
    Error_Handler();
  }
  sClockSourceConfig.ClockSource = TIM_CLOCKSOURCE_INTERNAL;
  if (HAL_TIM_ConfigClockSource(&htim1, &sClockSourceConfig) != HAL_OK)
  {
    Error_Handler();
  }
  sMasterConfig.MasterOutputTrigger = TIM_TRGO_RESET;
  sMasterConfig.MasterSlaveMode = TIM_MASTERSLAVEMODE_DISABLE;
  if (HAL_TIMEx_MasterConfigSynchronization(&htim1, &sMasterConfig) != HAL_OK)
  {
    Error_Handler();
  }
}

static void MX_USART1_UART_Init(void)
{
  huart1.Instance = USART1;
  huart1.Init.BaudRate = 115200;
  huart1.Init.WordLength = UART_WORDLENGTH_8B;
  huart1.Init.StopBits = UART_STOPBITS_1;
  huart1.Init.Parity = UART_PARITY_NONE;
  huart1.Init.Mode = UART_MODE_TX_RX;
  huart1.Init.HwFlowCtl = UART_HWCONTROL_NONE;
  huart1.Init.OverSampling = UART_OVERSAMPLING_16;
  if (HAL_UART_Init(&huart1) != HAL_OK)
  {
    Error_Handler();
  }
}

static void MX_GPIO_Init(void)
{
  GPIO_InitTypeDef GPIO_InitStruct = {0};

  /* GPIO Ports Clock Enable */
  __HAL_RCC_GPIOC_CLK_ENABLE();
  __HAL_RCC_GPIOF_CLK_ENABLE();
  __HAL_RCC_GPIOH_CLK_ENABLE();
  __HAL_RCC_GPIOA_CLK_ENABLE();
  __HAL_RCC_GPIOB_CLK_ENABLE();
  __HAL_RCC_GPIOG_CLK_ENABLE();
  __HAL_RCC_GPIOE_CLK_ENABLE();
  __HAL_RCC_GPIOD_CLK_ENABLE();

  /*Configure GPIO pin Output Level */
  HAL_GPIO_WritePin(GPIOC, NCS_MEMS_SPI_Pin|CSX_Pin|OTG_FS_PSO_Pin, GPIO_PIN_RESET);

  /*Configure GPIO pin Output Level */
  HAL_GPIO_WritePin(ACP_RST_GPIO_Port, ACP_RST_Pin, GPIO_PIN_RESET);

  /*Configure GPIO pin Output Level */
  HAL_GPIO_WritePin(GPIOD, RDX_Pin|WRX_DCX_Pin, GPIO_PIN_RESET);

  /*Configure GPIO pin Output Level */
  HAL_GPIO_WritePin(GPIOG, LD3_Pin|LD4_Pin, GPIO_PIN_RESET);

  /*Configure GPIO pins : NCS_MEMS_SPI_Pin CSX_Pin OTG_FS_PSO_Pin */
  GPIO_InitStruct.Pin = NCS_MEMS_SPI_Pin|CSX_Pin|OTG_FS_PSO_Pin;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
  HAL_GPIO_Init(GPIOC, &GPIO_InitStruct);

  /*Configure GPIO pins : B1_Pin MEMS_INT1_Pin MEMS_INT2_Pin TP_INT1_Pin */
  GPIO_InitStruct.Pin = B1_Pin|MEMS_INT1_Pin|MEMS_INT2_Pin|TP_INT1_Pin;
  GPIO_InitStruct.Mode = GPIO_MODE_EVT_RISING;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);

  /*Configure GPIO pin : ACP_RST_Pin */
  GPIO_InitStruct.Pin = ACP_RST_Pin;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
  HAL_GPIO_Init(ACP_RST_GPIO_Port, &GPIO_InitStruct);

  /*Configure GPIO pin : OTG_FS_OC_Pin */
  GPIO_InitStruct.Pin = OTG_FS_OC_Pin;
  GPIO_InitStruct.Mode = GPIO_MODE_EVT_RISING;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  HAL_GPIO_Init(OTG_FS_OC_GPIO_Port, &GPIO_InitStruct);

  /*Configure GPIO pin : BOOT1_Pin */
  GPIO_InitStruct.Pin = BOOT1_Pin;
  GPIO_InitStruct.Mode = GPIO_MODE_INPUT;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  HAL_GPIO_Init(BOOT1_GPIO_Port, &GPIO_InitStruct);

  /*Configure GPIO pin : TE_Pin */
  GPIO_InitStruct.Pin = TE_Pin;
  GPIO_InitStruct.Mode = GPIO_MODE_INPUT;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  HAL_GPIO_Init(TE_GPIO_Port, &GPIO_InitStruct);

  /*Configure GPIO pins : RDX_Pin WRX_DCX_Pin */
  GPIO_InitStruct.Pin = RDX_Pin|WRX_DCX_Pin;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
  HAL_GPIO_Init(GPIOD, &GPIO_InitStruct);

  /*Configure GPIO pins : LD3_Pin LD4_Pin */
  GPIO_InitStruct.Pin = LD3_Pin|LD4_Pin;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
  HAL_GPIO_Init(GPIOG, &GPIO_InitStruct);
}

void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim)
{
  if (htim->Instance == TIM6) {
    HAL_IncTick();
  }
}

/**
  * @brief  This function is executed in case of error occurrence.
  * @retval None
  */
void Error_Handler(void)
{
  __disable_irq();
  while (1)
  {
  }
}

void assert_failed(uint8_t *file, uint32_t line)
{
  /* User can add his own implementation to report the file name and line number,
     ex: printf("Wrong parameters value: file %s on line %d\r\n", file, line) */
}
```

## Application's `main.c`

Here is the application code. I omitted header files or init functions because they are the same ones in the bootloader `main.c` code.

```c
/* APPLICATION Core/Src/main.c
Copy and paste, running this code will not guarantee a normal build. This code only works in STM32CubeIDE with STM32F429I board
*/

int main(void)
{
  /* MCU Configuration */
  HAL_Init();
  SystemClock_Config();
  MX_GPIO_Init();
  MX_USART1_UART_Init();

  /* USER CODE BEGIN 2 */

  printf("\r\n");
  printf("========================================\r\n");
  printf("    APPLICATION v1.0                   \r\n");
  printf("========================================\r\n");
  printf("Running at address: 0x%08lX\r\n", (uint32_t)&main);
  printf("Application is running!\r\n");
  printf("\r\n");

  /* USER CODE END 2 */

  /* Infinite loop */
  while (1)
  {
    /* USER CODE BEGIN 3 */

    // Blink LED FAST (application pattern - different from bootloader)
    HAL_GPIO_TogglePin(GPIOG, GPIO_PIN_13);  // Green LED
    HAL_Delay(100);  // 100ms on, 100ms off (MUCH FASTER than bootloader)

    /* USER CODE END 3 */
  }
}
// ...
```

## Debugging 1: Check Application Code

Claude's first diagnosis was:

1. Verify Application Was Flashed Correctly (application should be flashed to the address `0x08010000`)
2. Check Application's Vector Table Offset in `system_stm32f4xx.c`
3. Check Application's Linker Script
4. Rebuild Application with Fix
5. Add Debugging to Application (add a simple LED indicator BEFORE any printf)

Items 1 through 4 can be easily resolved if the settings are corrected. On the other hand, it a problem occurs with item 5, it can be judged that there is an issue with the code itself. If you added debugging code to the application and it still doesn't work, it means there is a problem in the initialization process of the application.

As Claude says,

> Let's also make the application more robust. Sometimes the issue is that UART isn't initialized properly in the application.
> **In your Application's `main.c`, try adding a simple LED indicator BEFORE any printf:**

The following code is Claude's suggestion.

```c
/* APPLICATION Core/Src/main.c modified version
Copy and paste, running this code will not guarantee a normal build. This code only works in STM32CubeIDE with STM32F429I board
*/

int main(void)
{
  /* MCU Configuration */
  HAL_Init();
  SystemClock_Config();
  MX_GPIO_Init();

  // IMMEDIATE LED SIGNAL - Application started!
  // Flash LED very fast 10 times to show we reached application
  for (int i = 0; i < 10; i++)
  {
      HAL_GPIO_WritePin(GPIOG, GPIO_PIN_13, GPIO_PIN_SET);
      HAL_Delay(50);
      HAL_GPIO_WritePin(GPIOG, GPIO_PIN_13, GPIO_PIN_RESET);
      HAL_Delay(50);
  }

  MX_USART1_UART_Init();  // Now init UART

  /* USER CODE BEGIN 2 */

  printf("\r\n");
  printf("========================================\r\n");
  printf("    APPLICATION v1.0                   \r\n");
  printf("========================================\r\n");

  while (1)
  {
    /* USER CODE BEGIN 3 */

    // Blink LED FAST (application pattern - different from bootloader)
    HAL_GPIO_TogglePin(GPIOG, GPIO_PIN_13);  // Green LED
    HAL_Delay(100);  // 100ms on, 100ms off (MUCH FASTER than bootloader)

    /* USER CODE END 3 */
  }
}
// And the rest of the code ...
```

I first tested flashing Application.bin to `0x08010000`.
And the application runs. Here is the output I got:

```
========================================
    APPLICATION v1.0
========================================
Running at address: 0x080105AD
Application is running!
```

It wasn't the problem with the application code itself. LED blinks very fast and then the blink rate slows a bit down. It means there is no problem with UART init or run.

Also, I read memory address from 0x08010000 using STM32CubeProgrammer:

```
0x08010000: 20030000
0x08010004: 0801173D
```

As shown, `application.bin` was flashed to memory correctly.

I cleaned the project and rebuilt it. However, after flashing both binary files and pressing reset button, I saw a slow LED blink from the bootloader but no LED activity afterwards. It indicates that the application still isn't running properly.

| Slow LED blink (200ms)    | O     | Bootloader working          |
| ------------------------- | ----- | --------------------------- |
| **Fast LED blink (50ms)** | **X** | **Application not working** |

## Debugging 2: Simplify Peripheral Initialization

Claude suspected the problem might be related to complex peripheral initialization. Its reasoning was:

> When you flash the application **standalone** (without bootloader), it works because it's the first thing to run. But when jumping from the bootloader, **peripherals are already initialized by the bootloader** and might be in a conflicting state!
>
> 1. **Bootloader** initializes: GPIO, UART, USB_HOST, DMA2D, LTDC, FMC (SDRAM), etc.
> 2. **Bootloader** deinitializes HAL with `HAL_DeInit()` and `HAL_RCC_DeInit()`
> 3. **Bootloader jumps** to Application
> 4. **Application** tries to initialize the **same peripherals** again
> 5. **Conflict occurs** - application crashes or hangs
>
> The issue is likely with **complex peripherals** like FMC (external SDRAM), USB_HOST, LTDC, or DMA2D which might not fully deinitialize.

And it created a minimal application to test the jump mechanism, and modify the application's `main.c`:

```c
/* APPLICATION modified ver.2
Copy and paste, running this code will not guarantee a normal build. This code only works in STM32CubeIDE with STM32F429I board
*/

void SystemClock_Config(void);
static void MX_GPIO_Init(void);

int main(void)
{
  HAL_Init();
  SystemClock_Config();
  MX_GPIO_Init();

  for (int i = 0; i < 10; i++)
    {
        HAL_GPIO_WritePin(GPIOG, GPIO_PIN_13, GPIO_PIN_SET);
        HAL_Delay(50);
        HAL_GPIO_WritePin(GPIOG, GPIO_PIN_13, GPIO_PIN_RESET);
        HAL_Delay(50);
    }

  while (1)
  {
    HAL_GPIO_TogglePin(GPIOG, GPIO_PIN_13);  // Green LED
    HAL_Delay(100);  // 100ms on, 100ms off (MUCH FASTER than bootloader)
  }
}
// ...
```

I eventually left only GPIO, with no UART or other peripheral initialization. However, it still didn't jump to the application, or hung somewhere in the application. A weird thing was that the application itself worked fine when it was flashed to `0x08000000` without the bootloader.

## Debugging 3: Code without HAL APIs

This time, Claude asked several diagnostic questions:

### Q1. Does the Application Work When Flashed Standalone?

1. Open STM32CubeProgrammer
2. **Full chip erase:** Click "Full chip erase" button
3. Flash **ONLY** the Application.bin to **0x08000000** (NOT 0x08010000!)
4. Reset the board

### Q2. Verify the Linker Script

Open `Basic-Application/STM32F429ZITX_FLASH.ld`, and check the MEMORY section. See if in this section:

```
MEMORY
{
  RAM    (xrw) : ORIGIN = 0x20000000, LENGTH = 192K
  FLASH  (rx)  : ORIGIN = 0x????????, LENGTH = ????K
}
```

It says:

```
FLASH  (rx)  : ORIGIN = 0x08010000, LENGTH = 960K
```

### Q3. Verify VECT_TAB_OFFSET

In `Basic-Application/Core/Src/system_stm32f4xx.c`, check if the `VECT_TAB_OFFSET` is:

```
#define VECT_TAB_OFFSET  0x00010000U
```

### Q4. Check What's Actually in Flash Memory

**Using STM32CubeProgrammer:**

1. **Read bootloader area:**
   - Address: `0x08000000`
   - Should show: `0x20030000` (stack pointer)
2. **Read application area:**
   - Address: `0x08010000`
   - Should show: `0x20030000` (stack pointer)
   - Address: `0x08010004`
   - Should show: `0x0801XXXX` (reset handler address)

### Q5. Try an Even Simpler Application

Create an application SO simple it CAN'T fail - no HAL_Delay, just raw GPIO toggling:

```c
/* APPLICATION modified ver.3 - without HAL, just raw GPIO toggling
Copy and paste, running this code will not guarantee a normal build. This code only works in STM32CubeIDE with STM32F429I board
*/

#include "main.h"

void SystemClock_Config(void);

int main(void)
{
  // Minimal initialization
  HAL_Init();
  SystemClock_Config();

  // Enable GPIOG clock
  __HAL_RCC_GPIOG_CLK_ENABLE();

  // Configure PIN 13 as output
  GPIOG->MODER &= ~(3 << (13 * 2));  // Clear mode bits
  GPIOG->MODER |= (1 << (13 * 2));   // Set as output

  // Infinite loop - toggle LED with software delay
  while (1)
  {
    GPIOG->ODR |= (1 << 13);   // LED ON
    for (volatile int i = 0; i < 1000000; i++);  // Software delay

    GPIOG->ODR &= ~(1 << 13);  // LED OFF
    for (volatile int i = 0; i < 1000000; i++);  // Software delay
  }
}

void SystemClock_Config(void)
{
  RCC_OscInitTypeDef RCC_OscInitStruct = {0};
  RCC_ClkInitTypeDef RCC_ClkInitStruct = {0};

  __HAL_RCC_PWR_CLK_ENABLE();
  __HAL_PWR_VOLTAGESCALING_CONFIG(PWR_REGULATOR_VOLTAGE_SCALE3);

  RCC_OscInitStruct.OscillatorType = RCC_OSCILLATORTYPE_HSI;
  RCC_OscInitStruct.HSIState = RCC_HSI_ON;
  RCC_OscInitStruct.HSICalibrationValue = RCC_HSICALIBRATION_DEFAULT;
  RCC_OscInitStruct.PLL.PLLState = RCC_PLL_ON;
  RCC_OscInitStruct.PLL.PLLSource = RCC_PLLSOURCE_HSI;
  RCC_OscInitStruct.PLL.PLLM = 4;
  RCC_OscInitStruct.PLL.PLLN = 72;
  RCC_OscInitStruct.PLL.PLLP = RCC_PLLP_DIV2;
  RCC_OscInitStruct.PLL.PLLQ = 3;
  HAL_RCC_OscConfig(&RCC_OscInitStruct);

  RCC_ClkInitStruct.ClockType = RCC_CLOCKTYPE_HCLK|RCC_CLOCKTYPE_SYSCLK
                              |RCC_CLOCKTYPE_PCLK1|RCC_CLOCKTYPE_PCLK2;
  RCC_ClkInitStruct.SYSCLKSource = RCC_SYSCLKSOURCE_HSI;
  RCC_ClkInitStruct.AHBCLKDivider = RCC_SYSCLK_DIV1;
  RCC_ClkInitStruct.APB1CLKDivider = RCC_HCLK_DIV2;
  RCC_ClkInitStruct.APB2CLKDivider = RCC_HCLK_DIV1;
  HAL_RCC_ClockConfig(&RCC_ClkInitStruct, FLASH_LATENCY_0);
}

void Error_Handler(void) { while(1); }
```

Claude gave five diagnostic questions. Its approach was to start from the most basic checks (flash, memory address, linker script) and only then move on to code modifications:

1. Check basic variable settings
2. Verify the project build
3. Check the memory load process
4. Only if 1~3) show no issues, then proceed to modify the code. Remove or replace a suspicious feature with a simpler function to see if the code runs properly.

There are two lessons to learn from Claude. First, programmers often get so absorbed in their code that they forget to start testing from the basic settings. Second, the best approach is **cause elimination method** when the cause of a bug is uncertain.

## Debugging 4: Finding the Culprit

Now Claude's approach was to put `HAL_Delay()` back again to the code. I modified the previous ultra-simple main.c to use `HAL_Delay` instead of software delays:

```c
#include "main.h"

void SystemClock_Config(void);

int main(void)
{
  // Minimal initialization
  HAL_Init();  // This enables SysTick for HAL_Delay
  SystemClock_Config();

  // Enable GPIOG clock
  __HAL_RCC_GPIOG_CLK_ENABLE();

  // Configure PIN 13 as output
  GPIOG->MODER &= ~(3 << (13 * 2));
  GPIOG->MODER |= (1 << (13 * 2));

  // Infinite loop with HAL_Delay
  while (1)
  {
    GPIOG->ODR |= (1 << 13);   // LED ON
    HAL_Delay(100);            // Use HAL_Delay

    GPIOG->ODR &= ~(1 << 13);  // LED OFF
    HAL_Delay(100);            // Use HAL_Delay
  }
}

// Same SystemClock_Config as before
void SystemClock_Config(void) { /* ... */ }
void Error_Handler(void) { while(1); }
```

Yes, I modified the ultra-simple main.c to use `HAL_Delay()` instead of software delays. And it didn't work. Now we were pretty sure that `HAL_Delay()` was the problem.

## Claude's Diagnosis on `HAL_Delay()`

Why did `HAL_Delay` fail after the bootloader jump? `HAL_Delay()` depends on the **SysTick** timer, which generates interrupts every 1ms to increment a counter.

**The problem chain:**

1. Bootloader initializes SysTick (via `HAL_Init()`)
2. Bootloader **disables SysTick** before jumping:

```c
SysTick->CTRL = 0;
SysTick->LOAD = 0;
SysTick->VAL = 0;
```

3. Bootloader disables all interrupts: `__disable_irq();`
4. Bootloader jumps to application
5. Application calls `HAL_Init()` which should re-enable SysTick
6. **BUT** - interrupts are still globally disabled!
7. SysTick runs but its interrupt never fires
8. `HAL_Delay()` waits forever for a counter that never increments

The fix would be to **explicitly re-enable interrupts** after `HAL_Init()` in the application:

```c
HAL_Init();
__enable_irq();  // ← This re-enables global interrupts!
```

Right after `HAL_Init()`, add `__enable_irq()` in the application.

```c
#include "main.h"

void SystemClock_Config(void);

int main(void)
{
  // Minimal initialization
  HAL_Init();  // This sets up SysTick

  // CRITICAL: Re-enable interrupts!
  __enable_irq();  // ← ADD THIS LINE!

  SystemClock_Config();
  MX_GPIO_Init();
  MX_USART1_UART_Init();  // If you want UART back

  // Fast blink 10 times
  for (int i = 0; i < 10; i++)
  {
    HAL_GPIO_WritePin(GPIOG, GPIO_PIN_13, GPIO_PIN_SET);
    HAL_Delay(50);  // Works now!
    HAL_GPIO_WritePin(GPIOG, GPIO_PIN_13, GPIO_PIN_RESET);
    HAL_Delay(50);
  }

  printf("Application running!\r\n");

  while (1)
  {
    HAL_GPIO_TogglePin(GPIOG, GPIO_PIN_13);
    HAL_Delay(100);
  }
}
// ...
```

But again, this still didn't fix the problem.
