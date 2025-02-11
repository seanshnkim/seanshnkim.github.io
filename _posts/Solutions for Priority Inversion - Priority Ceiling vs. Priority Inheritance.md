
## Solution 1: Priority Ceiling Inheritance

Fortunately, FreeRTOS provides a mechanism called priority inheritance to mitigate the effects of priority inversion.

### How does priority inheritance work?

In priority inheritance, the program makes the priority of low priority task (LP Task) temporarily to that of high priority task. In this way, medium priority task cannot preempt the previous LP Task, and HP Task can access critical section as soon as LP Task releases the mutex.

```c
#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/semphr.h"

// Mutex handle
SemaphoreHandle_t xMutex;

// Task A (High priority)
void taskA(void *pvParameters) {
    printf("Task A (High priority) started\n");
    
    // Attempt to take the mutex (wait indefinitely)
    if (xSemaphoreTake(xMutex, portMAX_DELAY) == pdTRUE) {
        // Simulate critical section
        printf("Task A acquired the mutex and is working on the shared resource\n");
        vTaskDelay(500 / portTICK_PERIOD_MS);  // Simulate work (e.g., processing)
        printf("Task A finished its work and released the mutex\n");
        
        // Release the mutex
        xSemaphoreGive(xMutex);
    }

    // Task A is done
    vTaskDelete(NULL);
}

// Task B (Medium priority)
void taskB(void *pvParameters) {
    printf("Task B (Medium priority) started\n");
    
    // Simulate some work, but do not try to acquire the mutex
    for (int i = 0; i < 10; i++) {
        printf("Task B is doing some non-critical work\n");
        vTaskDelay(300 / portTICK_PERIOD_MS);  // Simulate work
    }
    
    // Task B is done
    vTaskDelete(NULL);
}

// Task C (Low priority)
void taskC(void *pvParameters) {
    printf("Task C (Low priority) started\n");
    

    xSemaphoreTake(xMutex, portMAX_DELAY);  // Take the mutex
        // Simulate holding the mutex for a long time
    printf("Task C is holding the mutex\n");
    // Simulate work while holding the mutex
    vTaskDelay(2000 / portTICK_PERIOD_MS);  // Simulate long critical section (holding mutex)
    
    printf("Task C finished its work and is releasing the mutex\n");
    
    // Release the mutex
    xSemaphoreGive(xMutex);

    // Task C is done
    vTaskDelete(NULL);
}

void app_main(void) {
    // Create the mutex with priority inheritance enabled by default
    xMutex = xSemaphoreCreateMutex();
    if (xMutex == NULL) {
        printf("Failed to create mutex\n");
        return;
    }


    // Create Task C (low priority)
    xTaskCreate(taskC, "Task C", 2048, NULL, 1, NULL);  // Priority 1 (Low priority)


    // Create Task A (high priority)
    xTaskCreate(taskA, "Task A", 2048, NULL, 3, NULL);  // Priority 3 (High priority)

    // Create Task B (medium priority)
    xTaskCreate(taskB, "Task B", 2048, NULL, 2, NULL);  // Priority 2 (Medium priority)

}

```

## Priority inheritance cannot cure priority inheritance

It is important to note that FreeRTOS implemented priority inheritance in mutext API.

But priority inheritance cannot cure priority inversion completely. In the following cases, priority inversion can still occur.


## Solution 2: Priority ceiling protocol




