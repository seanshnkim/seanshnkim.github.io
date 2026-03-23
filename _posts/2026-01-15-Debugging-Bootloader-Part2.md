---
layout: post
title: "Debugging Bootloader: Part 2"
date: 2026-01-16 01:45:05
categories: Firmware
toc:
  beginning: true
  sidebar: left
---

## Part 1 Summary

In the post Part 1, I introduced the problem where the application code wouldn't execute at all after calling `jump_to_application` from the bootloader.

As a first measure to address this problem, I verified the vector table offset and memory address in the linker script, and checked whether the application code was successfully flashed. Finally I confirmed whether the application program itself worked normally. However, when jumped from the bootloader, it kept hanging somewhere.

Second, o check if the UART protocol was the problem, I removed UART and commented out other peripheral initialization code, then tested again.

Third, to check if `HAL_Delay` was the problem, I wrote a very simple version of the application without it and tested. As a result, the application program successfully worked after jumping from the bootloader to the application.

Fourth, Claude explained that `HAL_Delay()` depends on the **SysTick** timer, and to re-enable the interrupt that SysTick calls every 1ms, I needed to add `__enable_irq()` to the application code.

In Part 1, I confirmed that there was a problem with `HAL_Delay`, specifically the SysTick timer. Now let's take a closer look at Part 2 to see why SysTick wasn't working.

## Debugging 5: Reinit SysTick Manually

Claude determined that there was a problem with the SysTick initialization process.

> Looking at your uploaded main.c, I see you added `__enable_irq()` but **HAL_Delay still hangs**. This means interrupts are enabled, but **SysTick interrupt is not firing**. The problem was that the bootloader is not properly re-initializing SysTick before jumping.

Let's trace what happens:

**In Bootloader:**

```c
HAL_Init();  // Sets up SysTick with HCLK as clock source
// ...
// Before jump:
SysTick->CTRL = 0;  // Disables SysTick completely
```

**In Application:**

```c
HAL_Init();  // Tries to set up SysTick again
__enable_irq();  // Enables global interrupts
```

**The issue:** `HAL_Init()` in the application assumes it's running after a clean reset, but the hardware state is NOT clean - it's been modified by the bootloader.

Claude's solution was to explicitly reinitialize SysTick in Application. Add this code before `__enable_irq()`:

```c
// 3. CRITICAL: Explicitly reinitialize SysTick with correct clock
//    HAL_Init() already configured it, but let's make sure it's using the right clock source
HAL_SYSTICK_Config(SystemCoreClock / 1000);  // 1ms tick
HAL_SYSTICK_CLKSourceConfig(SYSTICK_CLKSOURCE_HCLK);
```

At the same time, Claude also provided an alternative. In the bootloader's `jump_to_application()` function,

**Current code:**

```c
// 6. Disable SysTick
SysTick->CTRL = 0;
SysTick->LOAD = 0;
SysTick->VAL = 0;
```

It should be fixed to:

```c
// 6. Disable SysTick but keep it in a known state
SysTick->CTRL = 0;  // Disable
SysTick->LOAD = 0;  // Clear reload value
SysTick->VAL = 0;   // Clear current value

// 6a. Make sure SysTick interrupt priority is reset
HAL_NVIC_SetPriority(SysTick_IRQn, 0, 0);
```

Then Claude pointed out that `SystemCoreClock` is a global variable that stores the current system clock frequency, and it needs to be updated after `SystemClock_Config()`.

```c
// Check if `SystemClock_Config()` calls `SystemCoreClockUpdate()` at the end

void SystemClock_Config(void)
{
  // ... all your clock configuration ...

  if (HAL_RCC_ClockConfig(&RCC_ClkInitStruct, FLASH_LATENCY_0) != HAL_OK)
  {
    Error_Handler();
  }

  // ADD THIS if it's not there:
  SystemCoreClockUpdate();  // Update SystemCoreClock variable
}
```

This should ensure that `SystemCoreClock` has the correct value when calling `HAL_SYSTICK_Config(SystemCoreClock / 1000)`.

Unfortunately, this modification didn't work, and I decided to use a different approach.

## DEBUGGING 6: Starting Over Again

When nothing works while debugging, you naturally feel an urge to start over from the beginning. And this somehow makes sense. Embedded software programs have a lot to do with hardware initialization and configuration, and I was suspecting that I had accidentally removed or added something after creating the project.

STM32CubeIDE sets up default peripheral initialization when creating a new project. If you click "Yes" to Board Project Options "Initialize all peripherals with their default mode?", and look into the project workspace, you'll see many different header files, source code, and init functions inside `main.c`.

I created a whole new project in STM32CubeIDE, and then restarted the same test in the new project space. This time, I only worked on the bootloader. **And I found out that the newest version worked, while the old version did not work!** I had clearly only copied part of the code from the old version project and brought it to the new version project source code.

Except for the source code `main.c`, everything else was the same (project configurations, etc.). However, `main_Bootloader_old.c` hangs on HAL_Delay() infinitely while `main_Bootloader_new.c` works fine. What was the problem?

So this time I gave Claude both the old project (bootloader) `main.c` and the new project (again, only bootloader) `main.c` simultaneously and asked it to identify what the problem was.

The code is a bit long, but let me attach both the old version `main.c` and new version `main.c` here so we can compare them.

### OLD Version Bootloader

```c
// This one does NOT work

#include "main.h"
#include "usb_host.h"
#include <stdio.h>

UART_HandleTypeDef huart1;
DMA2D_HandleTypeDef hdma2d;
LTDC_HandleTypeDef hltdc;
TIM_HandleTypeDef htim1;

void SystemClock_Config(void);
static void MX_GPIO_Init(void);
static void MX_USART1_UART_Init(void);
static void MX_TIM1_Init(void);

int _write(int file, char *ptr, int len)
{
    HAL_UART_Transmit(&huart1, (uint8_t*)ptr, len, 1000);
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

    // 4. Disable all peripheral clocks (important!)
	__HAL_RCC_GPIOA_CLK_DISABLE();
	__HAL_RCC_GPIOB_CLK_DISABLE();
	__HAL_RCC_GPIOC_CLK_DISABLE();
	__HAL_RCC_GPIOD_CLK_DISABLE();
	__HAL_RCC_GPIOE_CLK_DISABLE();
	__HAL_RCC_GPIOF_CLK_DISABLE();
	__HAL_RCC_GPIOG_CLK_DISABLE();
	__HAL_RCC_GPIOH_CLK_DISABLE();
	__HAL_RCC_USART1_CLK_DISABLE();
	__HAL_RCC_USB_OTG_FS_CLK_DISABLE();
	__HAL_RCC_DMA2D_CLK_DISABLE();
	__HAL_RCC_LTDC_CLK_DISABLE();
	__HAL_RCC_FMC_CLK_DISABLE();

	// 5. Deinitialize HAL
	HAL_DeInit();

    // 6. Disable SysTick
    SysTick->CTRL = 0;
    SysTick->LOAD = 0;
    SysTick->VAL = 0;

    // 7. Clear all interrupt pending flags
	for (int i = 0; i < 8; i++)
	{
		NVIC->ICPR[i] = 0xFFFFFFFF;
	}

	// 8. Set the vector table address to the application's vector table
	SCB->VTOR = app_address;

    // 9. Set the stack pointer to the application's initial stack pointer
    __set_MSP(app_stack_pointer);

    // 10. Set control register
    __set_CONTROL(0);

    // 11. Jump to the application's reset handler
    void (*app_reset_handler)(void) = (void (*)(void))app_entry_point;
    app_reset_handler();

    // Should never reach here
    while (1);
}

int main(void)
{
  /* Reset of all peripherals, Initializes the Flash interface and the Systick. */
  HAL_Init();
  SystemClock_Config();

  MX_GPIO_Init();
  MX_USART1_UART_Init();
  MX_TIM1_Init();
  /* USER CODE BEGIN 2 */
  printf("\r\n");
  printf("========================================\r\n");
  printf("    BOOTLOADER v1.0                    \r\n");
  printf("========================================\r\n");
  printf("Running at address: 0x%08lX\r\n", (uint32_t)&main);
  printf("Bootloader running...\r\n");
//  printf("TIM1 added");
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

  RCC_OscInitStruct.OscillatorType = RCC_OSCILLATORTYPE_HSI;
  RCC_OscInitStruct.HSIState = RCC_HSI_ON;
  RCC_OscInitStruct.HSICalibrationValue = RCC_HSICALIBRATION_DEFAULT;
  RCC_OscInitStruct.PLL.PLLState = RCC_PLL_ON;
  RCC_OscInitStruct.PLL.PLLSource = RCC_PLLSOURCE_HSI;
  RCC_OscInitStruct.PLL.PLLM = 8;
  RCC_OscInitStruct.PLL.PLLN = 72;
  RCC_OscInitStruct.PLL.PLLP = RCC_PLLP_DIV2;
  RCC_OscInitStruct.PLL.PLLQ = 3;
  if (HAL_RCC_OscConfig(&RCC_OscInitStruct) != HAL_OK)
  {
    Error_Handler();
  }

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
  SystemCoreClockUpdate();
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
/* USER CODE BEGIN MX_GPIO_Init_1 */
/* USER CODE END MX_GPIO_Init_1 */

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

void Error_Handler(void)
{
  /* USER CODE BEGIN Error_Handler_Debug */
  /* User can add his own implementation to report the HAL error return state */
  __disable_irq();
  while (1)
  {
  }
  /* USER CODE END Error_Handler_Debug */
}

void assert_failed(uint8_t *file, uint32_t line)
{
}
```

### NEW Version Bootloader

```c
/* NEW VERSION main.c
This one WORKS! */

#include "main.h"
#include "usb_host.h"
#include <stdio.h>

CRC_HandleTypeDef hcrc;
DMA2D_HandleTypeDef hdma2d;
I2C_HandleTypeDef hi2c3;
LTDC_HandleTypeDef hltdc;
SPI_HandleTypeDef hspi5;
TIM_HandleTypeDef htim1;
UART_HandleTypeDef huart1;
SDRAM_HandleTypeDef hsdram1;

void SystemClock_Config(void);
static void MX_GPIO_Init(void);
static void MX_CRC_Init(void);
static void MX_DMA2D_Init(void);
static void MX_FMC_Init(void);
static void MX_I2C3_Init(void);
static void MX_LTDC_Init(void);
static void MX_SPI5_Init(void);
static void MX_TIM1_Init(void);
static void MX_USART1_UART_Init(void);
void MX_USB_HOST_Process(void);

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

    // 4. Disable all peripheral clocks (important!)
	__HAL_RCC_GPIOA_CLK_DISABLE();
	__HAL_RCC_GPIOB_CLK_DISABLE();
	__HAL_RCC_GPIOC_CLK_DISABLE();
	__HAL_RCC_GPIOD_CLK_DISABLE();
	__HAL_RCC_GPIOE_CLK_DISABLE();
	__HAL_RCC_GPIOF_CLK_DISABLE();
	__HAL_RCC_GPIOG_CLK_DISABLE();
	__HAL_RCC_GPIOH_CLK_DISABLE();
	__HAL_RCC_USART1_CLK_DISABLE();
	__HAL_RCC_USB_OTG_FS_CLK_DISABLE();
	__HAL_RCC_DMA2D_CLK_DISABLE();
	__HAL_RCC_LTDC_CLK_DISABLE();
	__HAL_RCC_FMC_CLK_DISABLE();

	// 5. Deinitialize HAL
	HAL_DeInit();

    // 6. Disable SysTick
    SysTick->CTRL = 0;
    SysTick->LOAD = 0;
    SysTick->VAL = 0;

    // 7. Clear all interrupt pending flags
	for (int i = 0; i < 8; i++)
	{
		NVIC->ICPR[i] = 0xFFFFFFFF;
	}

	// 8. Set the vector table address to the application's vector table
	SCB->VTOR = app_address;

    // 9. Set the stack pointer to the application's initial stack pointer
    __set_MSP(app_stack_pointer);

    // 10. Set control register
    __set_CONTROL(0);

    // 11. Jump to the application's reset handler
    void (*app_reset_handler)(void) = (void (*)(void))app_entry_point;
    app_reset_handler();

    // Should never reach here
    while (1);
}
/* USER CODE END 0 */

int main(void)
{

  HAL_Init();
  SystemClock_Config();
  MX_GPIO_Init();
  MX_CRC_Init();
  MX_DMA2D_Init();
  MX_FMC_Init();
  MX_I2C3_Init();
  MX_LTDC_Init();
  MX_SPI5_Init();
  MX_TIM1_Init();
  MX_USART1_UART_Init();
  MX_USB_HOST_Init();

  printf("\r\n");
  printf("========================================\r\n");
  printf("    BOOTLOADER NEW                    \r\n");
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
    MX_USB_HOST_Process();

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

  RCC_OscInitStruct.OscillatorType = RCC_OSCILLATORTYPE_HSI;
  RCC_OscInitStruct.HSIState = RCC_HSI_ON;
  RCC_OscInitStruct.HSICalibrationValue = RCC_HSICALIBRATION_DEFAULT;
  RCC_OscInitStruct.PLL.PLLState = RCC_PLL_ON;
  RCC_OscInitStruct.PLL.PLLSource = RCC_PLLSOURCE_HSI;
  RCC_OscInitStruct.PLL.PLLM = 8;
  RCC_OscInitStruct.PLL.PLLN = 72;
  RCC_OscInitStruct.PLL.PLLP = RCC_PLLP_DIV2;
  RCC_OscInitStruct.PLL.PLLQ = 3;
  if (HAL_RCC_OscConfig(&RCC_OscInitStruct) != HAL_OK)
  {
    Error_Handler();
  }

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
  SystemCoreClockUpdate();
}

static void MX_CRC_Init(void)
{
  hcrc.Instance = CRC;
  if (HAL_CRC_Init(&hcrc) != HAL_OK)
  {
    Error_Handler();
  }
}

static void MX_DMA2D_Init(void)
{
  hdma2d.Instance = DMA2D;
  hdma2d.Init.Mode = DMA2D_M2M;
  hdma2d.Init.ColorMode = DMA2D_OUTPUT_ARGB8888;
  hdma2d.Init.OutputOffset = 0;
  hdma2d.LayerCfg[1].InputOffset = 0;
  hdma2d.LayerCfg[1].InputColorMode = DMA2D_INPUT_ARGB8888;
  hdma2d.LayerCfg[1].AlphaMode = DMA2D_NO_MODIF_ALPHA;
  hdma2d.LayerCfg[1].InputAlpha = 0;
  if (HAL_DMA2D_Init(&hdma2d) != HAL_OK)
  {
    Error_Handler();
  }
  if (HAL_DMA2D_ConfigLayer(&hdma2d, 1) != HAL_OK)
  {
    Error_Handler();
  }

}

static void MX_I2C3_Init(void)
{
  hi2c3.Instance = I2C3;
  hi2c3.Init.ClockSpeed = 100000;
  hi2c3.Init.DutyCycle = I2C_DUTYCYCLE_2;
  hi2c3.Init.OwnAddress1 = 0;
  hi2c3.Init.AddressingMode = I2C_ADDRESSINGMODE_7BIT;
  hi2c3.Init.DualAddressMode = I2C_DUALADDRESS_DISABLE;
  hi2c3.Init.OwnAddress2 = 0;
  hi2c3.Init.GeneralCallMode = I2C_GENERALCALL_DISABLE;
  hi2c3.Init.NoStretchMode = I2C_NOSTRETCH_DISABLE;
  if (HAL_I2C_Init(&hi2c3) != HAL_OK)
  {
    Error_Handler();
  }
  if (HAL_I2CEx_ConfigAnalogFilter(&hi2c3, I2C_ANALOGFILTER_ENABLE) != HAL_OK)
  {
    Error_Handler();
  }

  if (HAL_I2CEx_ConfigDigitalFilter(&hi2c3, 0) != HAL_OK)
  {
    Error_Handler();
  }
}

static void MX_LTDC_Init(void)
{
  LTDC_LayerCfgTypeDef pLayerCfg = {0};

  hltdc.Instance = LTDC;
  hltdc.Init.HSPolarity = LTDC_HSPOLARITY_AL;
  hltdc.Init.VSPolarity = LTDC_VSPOLARITY_AL;
  hltdc.Init.DEPolarity = LTDC_DEPOLARITY_AL;
  hltdc.Init.PCPolarity = LTDC_PCPOLARITY_IPC;
  hltdc.Init.HorizontalSync = 9;
  hltdc.Init.VerticalSync = 1;
  hltdc.Init.AccumulatedHBP = 29;
  hltdc.Init.AccumulatedVBP = 3;
  hltdc.Init.AccumulatedActiveW = 269;
  hltdc.Init.AccumulatedActiveH = 323;
  hltdc.Init.TotalWidth = 279;
  hltdc.Init.TotalHeigh = 327;
  hltdc.Init.Backcolor.Blue = 0;
  hltdc.Init.Backcolor.Green = 0;
  hltdc.Init.Backcolor.Red = 0;
  if (HAL_LTDC_Init(&hltdc) != HAL_OK)
  {
    Error_Handler();
  }
  pLayerCfg.WindowX0 = 0;
  pLayerCfg.WindowX1 = 240;
  pLayerCfg.WindowY0 = 0;
  pLayerCfg.WindowY1 = 320;
  pLayerCfg.PixelFormat = LTDC_PIXEL_FORMAT_RGB565;
  pLayerCfg.Alpha = 255;
  pLayerCfg.Alpha0 = 0;
  pLayerCfg.BlendingFactor1 = LTDC_BLENDING_FACTOR1_PAxCA;
  pLayerCfg.BlendingFactor2 = LTDC_BLENDING_FACTOR2_PAxCA;
  pLayerCfg.FBStartAdress = 0xD0000000;
  pLayerCfg.ImageWidth = 240;
  pLayerCfg.ImageHeight = 320;
  pLayerCfg.Backcolor.Blue = 0;
  pLayerCfg.Backcolor.Green = 0;
  pLayerCfg.Backcolor.Red = 0;
  if (HAL_LTDC_ConfigLayer(&hltdc, &pLayerCfg, 0) != HAL_OK)
  {
    Error_Handler();
  }
}

static void MX_SPI5_Init(void)
{
  hspi5.Instance = SPI5;
  hspi5.Init.Mode = SPI_MODE_MASTER;
  hspi5.Init.Direction = SPI_DIRECTION_2LINES;
  hspi5.Init.DataSize = SPI_DATASIZE_8BIT;
  hspi5.Init.CLKPolarity = SPI_POLARITY_LOW;
  hspi5.Init.CLKPhase = SPI_PHASE_1EDGE;
  hspi5.Init.NSS = SPI_NSS_SOFT;
  hspi5.Init.BaudRatePrescaler = SPI_BAUDRATEPRESCALER_16;
  hspi5.Init.FirstBit = SPI_FIRSTBIT_MSB;
  hspi5.Init.TIMode = SPI_TIMODE_DISABLE;
  hspi5.Init.CRCCalculation = SPI_CRCCALCULATION_DISABLE;
  hspi5.Init.CRCPolynomial = 10;
  if (HAL_SPI_Init(&hspi5) != HAL_OK)
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

/* FMC initialization function */
static void MX_FMC_Init(void)
{
  FMC_SDRAM_TimingTypeDef SdramTiming = {0};

  hsdram1.Instance = FMC_SDRAM_DEVICE;
  /* hsdram1.Init */
  hsdram1.Init.SDBank = FMC_SDRAM_BANK2;
  hsdram1.Init.ColumnBitsNumber = FMC_SDRAM_COLUMN_BITS_NUM_8;
  hsdram1.Init.RowBitsNumber = FMC_SDRAM_ROW_BITS_NUM_12;
  hsdram1.Init.MemoryDataWidth = FMC_SDRAM_MEM_BUS_WIDTH_16;
  hsdram1.Init.InternalBankNumber = FMC_SDRAM_INTERN_BANKS_NUM_4;
  hsdram1.Init.CASLatency = FMC_SDRAM_CAS_LATENCY_3;
  hsdram1.Init.WriteProtection = FMC_SDRAM_WRITE_PROTECTION_DISABLE;
  hsdram1.Init.SDClockPeriod = FMC_SDRAM_CLOCK_PERIOD_2;
  hsdram1.Init.ReadBurst = FMC_SDRAM_RBURST_DISABLE;
  hsdram1.Init.ReadPipeDelay = FMC_SDRAM_RPIPE_DELAY_1;
  /* SdramTiming */
  SdramTiming.LoadToActiveDelay = 2;
  SdramTiming.ExitSelfRefreshDelay = 7;
  SdramTiming.SelfRefreshTime = 4;
  SdramTiming.RowCycleDelay = 7;
  SdramTiming.WriteRecoveryTime = 3;
  SdramTiming.RPDelay = 2;
  SdramTiming.RCDDelay = 2;

  if (HAL_SDRAM_Init(&hsdram1, &SdramTiming) != HAL_OK)
  {
    Error_Handler( );
  }
}

static void MX_GPIO_Init(void)
{
  GPIO_InitTypeDef GPIO_InitStruct = {0};
/* USER CODE BEGIN MX_GPIO_Init_1 */
/* USER CODE END MX_GPIO_Init_1 */

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

void Error_Handler(void)
{
  __disable_irq();
  while (1)
  {
  }
  /* USER CODE END Error_Handler_Debug */
}

void assert_failed(uint8_t *file, uint32_t line)
{
  /* USER CODE BEGIN 6 */
  /* User can add his own implementation to report the file name and line number,
     ex: printf("Wrong parameters value: file %s on line %d\r\n", file, line) */
  /* USER CODE END 6 */
}
#endif /* USE_FULL_ASSERT */

```

### What Was Claude's Answer?

Instead of answering immediately, Claude asked me to clarify my question:

"**First, a key question:** In `main_Bootloader_old.c`, where exactly does it hang? Is it:

1. During the initial LED blinks (the `for` loop with 3 blinks)?
2. During the `HAL_Delay(500)` right before jumping?
3. Or somewhere else?

**Now, here's what I want you to investigate:**

Look at the `MX_TIM1_Init()` function in old version. Do you see that TIM1 is initialized but **never started**?

Compare this with what you likely have in new version - I suspect new one either:

- Doesn't initialize TIM1 at all, OR
- Actually starts TIM1 with `HAL_TIM_Base_Start(&htim1)`

**Why does this matter for HAL_Delay()?**

Think about how `HAL_Delay()` works in STM32 HAL. What timer does it typically rely on for its timebase?

Hint: Look at your `SystemClock_Config()` - do you see any SysTick configuration there? The HAL library needs a functioning timebase to make `HAL_Delay()` work.

**Here's what I think is happening:**

The TIM1 initialization in the old version might be interfering with the SysTick timer that HAL normally uses for its timebase. Can you check:

1. Is TIM1 actually needed for your bootloader functionality?
2. What happens if you comment out `MX_TIM1_Init()` in the old one?

Try that and let me know what you find!"

But commenting out `MX_TIM1_Init()` didn't fix anything. Then Claude suggested debug code to see if the SysTick registers had correct values.

```c
// Add this debug code RIGHT BEFORE first HAL_Delay()
printf("SysTick CTRL: 0x%08lX\r\n", SysTick->CTRL);
printf("SysTick LOAD: 0x%08lX\r\n", SysTick->LOAD);
printf("About to call HAL_Delay...\r\n");
HAL_Delay(200);
printf("HAL_Delay completed!\r\n");
```

With this, Claude asked:

> In your STM32CubeIDE project settings for v1, go to:
>
> - Project → Properties → C/C++ Build → Settings → MCU/MPU Settings
> - What is the "Timebase Source" set to?
>   Look at the `stm32f4xx_it.c` file. Search for the function `SysTick_Handler()`.
>   Is it there?
> - Does it call `HAL_IncTick()`?

According to my finding, 1) Both projects had timebase source to TIM1 and 2) `SysTick_Handler()` was in stm32f4xx_it.c, calling `HAL_IncTick`. There seemed to be nothing different.

My output was:

```
========================================
    BOOTLOADER v1.0
========================================
Running at address: 0x08000735

SysTick CTRL: 0x00000000
SysTick LOAD: 0x00000000
About to call HAL_Delay...
```

From this output, we can notice that:

1. The program still hangs in `HAL_Delay`
2. SysTick is completely disabled as the CTRL and LOAD register values are fixed to 0

## Debugging 8: Why Is SysTick Disabled?

Now we were getting closer. For some reason `HAL_Delay()` still wasn't working, and we found out it was related to SysTick initialization. We confirmed that SysTick was disabled by checking the register values.

Let's go back to Claude's explanation:

> This tells us that **SysTick is completely disabled** - it's not running at all. That's why `HAL_Delay()` hangs forever - it's waiting for a tick that will never come.
>
> **Now here's the critical insight:**
>
> You have `stm32f4xx_hal_timebase_tim.c` in your project, which means your project is configured to use **TIM1 as the HAL timebase** instead of SysTick. But your `SysTick_Handler()` is empty (which is correct for TIM-based timebase), so the question is:
>
> **Where is `TIM1_UP_TIM10_IRQHandler()` and does it call `HAL_IncTick()`?**
>
> Check your `stm32f4xx_it.c` file - search for this function. It should look something like:

I immediately searched if `TIM1_UP_TIM10_IRQHandler` was working properly and found out three facts:

1. First, there is no `TIM1_UP_TIM10_IRQHandler()` inside the `stm32f4xx_it.c` file.
2. Both the old and the new version have the same timebase source: TIM6.
3. I put the same debug message in the new version (which works fine!) and it seems like it's NOT using SysTick for its timebase source. Let's look at the code below.

```
========================================
    BOOTLOADER NEW
========================================
Running at address: 0x08000735
SysTick CTRL: 0x00000000
SysTick LOAD: 0x00000000
About to call HAL_Delay...
HAL_Delay completed!
Bootloader running... (LED blinks 3 times)
Attempting to jump to application...
Preparing to jump to application at 0x08010000...
  App Stack Pointer: 0x20030000
  App Entry Point:   0x08011611
Jumping to application NOW!
```

To summarize, both the old and the new version:

- Use **TIM6** as the HAL timebase (not SysTick)
- Have `TIM6_DAC_IRQHandler()` in the interrupt file
- Show SysTick disabled (0x00000000)

This means the issue is that **TIM6 is not properly initialized or started in the old version**.

## Final Solution

I started to look for any code that was related to the timebase source, `TIM6` or `SysTick`. And as I carefully looked into both codes and compared them, I found the suspect. There was one method missing in the old version, the one I had been overlooking for so long:

```c
/**
* @brief  Period elapsed callback in non blocking mode
* @note   This function is called  when TIM6 interrupt took place, inside
* HAL_TIM_IRQHandler(). It makes a direct call to HAL_IncTick() to increment
* a global variable "uwTick" used as application time base.
* @param  htim : TIM handle
* @retval None
*/
void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim)
{
  if (htim->Instance == TIM6) {
    HAL_IncTick();
  }
}
```

Now when I put this function back in the old one, it worked like magic.

But we shouldn't stop here. The virtue of a good programmer is not just frantically fixing errors, but understanding the concepts and principles behind them to thoroughly prevent similar bugs from happening.

## Last Question: What Happened So Far? Why Does `HAL_TIM_PeriodElapsedCallback` Mattter?

TIM6 overflows every 1ms, and `TIM6_DAC_IRQHandler()` is called. This IRQ handler calls a function `HAL_TIM_IRQHandler`.

Let's look at the `stm32f4xx_it.c` file and you'll see it calls `HAL_TIM_IRQHandler(&htim6)`.

```c
// Core/Src/stm32f4xx_it.c
// ...
void TIM6_DAC_IRQHandler(void)
{
  /* USER CODE BEGIN TIM6_DAC_IRQn 0 */

  /* USER CODE END TIM6_DAC_IRQn 0 */
  HAL_TIM_IRQHandler(&htim6);
  /* USER CODE BEGIN TIM6_DAC_IRQn 1 */

  /* USER CODE END TIM6_DAC_IRQn 1 */
}
```

`HAL_TIM_IRQHandler()` handles the timer interrupt, but how does it notify the rest of the HAL library that a "tick" has occurred? Or in other words, how does it increment `uwTick`?

This `uwTick` variable is used for `HAL_Delay`. If `HAL_Delay(200)` is waiting for `uwTick` to increase by 200, but `uwTick` never increments, then it will hang forever like what happened in my old version code.

`HAL_TIM_IRQHandler()` doesn't directly call `HAL_IncTick()`. Instead, it calls a **callback function** - which is `HAL_TIM_PeriodElapsedCallback()`.

```c
// Drivers/STM32F4xx_HAL_Driver/Src/stm32f4xx_hal_tim.c

void HAL_TIM_IRQHandler(TIM_HandleTypeDef *htim)
{
  uint32_t itsource = htim->Instance->DIER;
  uint32_t itflag   = htim->Instance->SR;

  /* Capture compare 1 event */
  if ((itflag & (TIM_FLAG_CC1)) == (TIM_FLAG_CC1))
  {
    if ((itsource & (TIM_IT_CC1)) == (TIM_IT_CC1))
    {
      {
        __HAL_TIM_CLEAR_FLAG(htim, TIM_FLAG_CC1);
        htim->Channel = HAL_TIM_ACTIVE_CHANNEL_1;

        /* Input capture event */
        if ((htim->Instance->CCMR1 & TIM_CCMR1_CC1S) != 0x00U)
        {
#if (USE_HAL_TIM_REGISTER_CALLBACKS == 1)
          htim->IC_CaptureCallback(htim);
#else
          HAL_TIM_IC_CaptureCallback(htim);
#endif /* USE_HAL_TIM_REGISTER_CALLBACKS */
        }
        /* Output compare event */
        else
        {
#if (USE_HAL_TIM_REGISTER_CALLBACKS == 1)
          htim->OC_DelayElapsedCallback(htim);
          htim->PWM_PulseFinishedCallback(htim);
#else
          HAL_TIM_OC_DelayElapsedCallback(htim);
          HAL_TIM_PWM_PulseFinishedCallback(htim);
#endif /* USE_HAL_TIM_REGISTER_CALLBACKS */
        }
        htim->Channel = HAL_TIM_ACTIVE_CHANNEL_CLEARED;
      }
    }
  }
  /* Capture compare 2 event */
  if ((itflag & (TIM_FLAG_CC2)) == (TIM_FLAG_CC2))
  {
    if ((itsource & (TIM_IT_CC2)) == (TIM_IT_CC2))
    {
      __HAL_TIM_CLEAR_FLAG(htim, TIM_FLAG_CC2);
      htim->Channel = HAL_TIM_ACTIVE_CHANNEL_2;
      /* Input capture event */
      if ((htim->Instance->CCMR1 & TIM_CCMR1_CC2S) != 0x00U)
      {
#if (USE_HAL_TIM_REGISTER_CALLBACKS == 1)
        htim->IC_CaptureCallback(htim);
#else
        HAL_TIM_IC_CaptureCallback(htim);
#endif /* USE_HAL_TIM_REGISTER_CALLBACKS */
      }
      /* Output compare event */
      else
      {
#if (USE_HAL_TIM_REGISTER_CALLBACKS == 1)
        htim->OC_DelayElapsedCallback(htim);
        htim->PWM_PulseFinishedCallback(htim);
#else
        HAL_TIM_OC_DelayElapsedCallback(htim);
        HAL_TIM_PWM_PulseFinishedCallback(htim);
#endif /* USE_HAL_TIM_REGISTER_CALLBACKS */
      }
      htim->Channel = HAL_TIM_ACTIVE_CHANNEL_CLEARED;
    }
  }
  /* Capture compare 3 event */
  if ((itflag & (TIM_FLAG_CC3)) == (TIM_FLAG_CC3))
  {
    if ((itsource & (TIM_IT_CC3)) == (TIM_IT_CC3))
    {
      __HAL_TIM_CLEAR_FLAG(htim, TIM_FLAG_CC3);
      htim->Channel = HAL_TIM_ACTIVE_CHANNEL_3;
      /* Input capture event */
      if ((htim->Instance->CCMR2 & TIM_CCMR2_CC3S) != 0x00U)
      {
#if (USE_HAL_TIM_REGISTER_CALLBACKS == 1)
        htim->IC_CaptureCallback(htim);
#else
        HAL_TIM_IC_CaptureCallback(htim);
#endif /* USE_HAL_TIM_REGISTER_CALLBACKS */
      }
      /* Output compare event */
      else
      {
#if (USE_HAL_TIM_REGISTER_CALLBACKS == 1)
        htim->OC_DelayElapsedCallback(htim);
        htim->PWM_PulseFinishedCallback(htim);
#else
        HAL_TIM_OC_DelayElapsedCallback(htim);
        HAL_TIM_PWM_PulseFinishedCallback(htim);
#endif /* USE_HAL_TIM_REGISTER_CALLBACKS */
      }
      htim->Channel = HAL_TIM_ACTIVE_CHANNEL_CLEARED;
    }
  }
  /* Capture compare 4 event */
  if ((itflag & (TIM_FLAG_CC4)) == (TIM_FLAG_CC4))
  {
    if ((itsource & (TIM_IT_CC4)) == (TIM_IT_CC4))
    {
      __HAL_TIM_CLEAR_FLAG(htim, TIM_FLAG_CC4);
      htim->Channel = HAL_TIM_ACTIVE_CHANNEL_4;
      /* Input capture event */
      if ((htim->Instance->CCMR2 & TIM_CCMR2_CC4S) != 0x00U)
      {
#if (USE_HAL_TIM_REGISTER_CALLBACKS == 1)
        htim->IC_CaptureCallback(htim);
#else
        HAL_TIM_IC_CaptureCallback(htim);
#endif /* USE_HAL_TIM_REGISTER_CALLBACKS */
      }
      /* Output compare event */
      else
      {
#if (USE_HAL_TIM_REGISTER_CALLBACKS == 1)
        htim->OC_DelayElapsedCallback(htim);
        htim->PWM_PulseFinishedCallback(htim);
#else
        HAL_TIM_OC_DelayElapsedCallback(htim);
        HAL_TIM_PWM_PulseFinishedCallback(htim);
#endif /* USE_HAL_TIM_REGISTER_CALLBACKS */
      }
      htim->Channel = HAL_TIM_ACTIVE_CHANNEL_CLEARED;
    }
  }
  /* TIM Update event */
  if ((itflag & (TIM_FLAG_UPDATE)) == (TIM_FLAG_UPDATE))
  {
    if ((itsource & (TIM_IT_UPDATE)) == (TIM_IT_UPDATE))
    {
      __HAL_TIM_CLEAR_FLAG(htim, TIM_FLAG_UPDATE);
#if (USE_HAL_TIM_REGISTER_CALLBACKS == 1)
      htim->PeriodElapsedCallback(htim);
#else
      HAL_TIM_PeriodElapsedCallback(htim);
#endif /* USE_HAL_TIM_REGISTER_CALLBACKS */
    }
  }
  /* TIM Break input event */
  if ((itflag & (TIM_FLAG_BREAK)) == (TIM_FLAG_BREAK))
  {
    if ((itsource & (TIM_IT_BREAK)) == (TIM_IT_BREAK))
    {
      __HAL_TIM_CLEAR_FLAG(htim, TIM_FLAG_BREAK);
#if (USE_HAL_TIM_REGISTER_CALLBACKS == 1)
      htim->BreakCallback(htim);
#else
      HAL_TIMEx_BreakCallback(htim);
#endif /* USE_HAL_TIM_REGISTER_CALLBACKS */
    }
  }
  /* TIM Trigger detection event */
  if ((itflag & (TIM_FLAG_TRIGGER)) == (TIM_FLAG_TRIGGER))
  {
    if ((itsource & (TIM_IT_TRIGGER)) == (TIM_IT_TRIGGER))
    {
      __HAL_TIM_CLEAR_FLAG(htim, TIM_FLAG_TRIGGER);
#if (USE_HAL_TIM_REGISTER_CALLBACKS == 1)
      htim->TriggerCallback(htim);
#else
      HAL_TIM_TriggerCallback(htim);
#endif /* USE_HAL_TIM_REGISTER_CALLBACKS */
    }
  }
  /* TIM commutation event */
  if ((itflag & (TIM_FLAG_COM)) == (TIM_FLAG_COM))
  {
    if ((itsource & (TIM_IT_COM)) == (TIM_IT_COM))
    {
      __HAL_TIM_CLEAR_FLAG(htim, TIM_FLAG_COM);
#if (USE_HAL_TIM_REGISTER_CALLBACKS == 1)
      htim->CommutationCallback(htim);
#else
      HAL_TIMEx_CommutCallback(htim);
#endif /* USE_HAL_TIM_REGISTER_CALLBACKS */
    }
  }
}
```

## TIM1 vs. TIM6: How did the program choose to init TIM6 automatically?

In fact, the TIM6 initialization for the HAL timebase doesn't happen in `main.c` at all.

- `HAL_Init()` is called first in `main()`
- Inside `HAL_Init()`, it needs to set up the timebase
- `HAL_Init()` calls `HAL_InitTick()`
- `HAL_InitTick()` is defined in `stm32f4xx_hal_timebase_tim.c` (not in the standard HAL library)
- This custom `HAL_InitTick()` initializes and starts TIM6 as the timebase

TIM6 gets initialized **automatically** when I call `HAL_Init()`, because the custom `stm32f4xx_hal_timebase_tim.c` file overrides the default timebase initialization.

And even though I initialized TIM1 in `main.c`, it was initialized separately for **some other application-specific purpose** (not for HAL timebase).

## Conclusion

Although the cause was really simple, it took far too long to find it. I learned several lessons in the process.

### Lesson 1. Use "Just Fix It" Requests Only Once at the Beginning

Continuously asking Claude vague questions in short form like "This is not working. Please help me debug the code." is not appropriate. While you might get lucky and find the cause immediately if the code is simple, Claude always provides generic answers. Especially if you repeat this question, it can lead to even more irrelevant answers.

### Lesson 2. If You Can't Find the Cause No Matter How Hard You Look, Define Candidates and Eliminate Them One by One

It's best to first ask Claude to narrow down several bug cause candidates, then persistently and deeply dig into each cause to identify them one by one through elimination. Since Claude is far faster than humans at writing debugging code, leverage this advantage to use a strategy of quick debugging → eliminate likely candidates.

To rephrase this, initially write specifically about 1) where the problem occurred (error message? infinite while loop? no output? etc.) and 2) what intention you had when writing the code, and ask Claude about it.

"I'm having trouble running this code. The program hangs somewhere here, and the output is like this. This is the `main.c`. Find and narrow down as many candidates as possible that could be causing this bug."

And then ask:

"If A is a potential cause, how can I verify if it's a problem? Present a series of checkpoint items and write code for testing."

### Lesson 3. Keep Debugging Logs

Every time you modify code, you must record what parts you modified and what you were thinking when you modified them. I made the mistake of constantly overwriting code because I was thinking I needed to solve the problem quickly, but this makes it difficult to review what problems I encountered and how I solved them later.

One thing is certain: Claude's conversation history alone is insufficient for debugging. You must commit versions to git while simultaneously keeping logs.
