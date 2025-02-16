---
layout: post
title: Priority Queue in Python and in CPP
date: 2024-01-07 12:41:30
description: 
tags:
  - priority-queue
categories:
  - Data-Structure-and-Algorithms
---

## Priority Queue in Python
### Module

- In Python, `heapq` is used for priority queue.

```python
import heapq
```

### Mainly used methods
These are three main methods to manipulate heapq:

```python
heapq.heapify(nums)
heapq.heappush(hq, n)
n = heapq.heappop(hq)
```

### heapq is by default min heap
By default, heapq is min heap in Python.
To change it into max heap, just **negate** (multiply by -1) the values when storing them.

### Sample Code

```python
import heapq

nums = [2, 3, 4, 1]

# To make a heap from a given list, there are two ways:
hp1 = []
for n in nums:
	heapq.heappush(hp, n)

# Instead of returning a new one, heapify() modifies the original array (nums) into a heap
# heapq.heapify(nums)

ans = 0
while q:
    first = heapq.heappop(q)
    
    if not q:
        break
    
    second = heapq.heappop(q)
    heapq.heappush(q, first + second)
    ans += (first + second)

print(ans)
```

## Priority Queue in C++
### Header file (module)
When importing a module for priority queue for C++, it can be a little confusing. 
This is how to define a priority queue in C++:

```cpp
priority_queue<int> pq;
```

However, this does not work:

```cpp
#include <priority_queue>
```

Instead, include `queue` header file:

```cpp
#include <queue>
```

### Main methods
There are four main methods (and syntax) to manipulate a priority queue in C++:

```cpp
priority_queue<int> pq;
pq.push(n);
int n = pq.top();
pq.pop();
```

### priority_queue is by default max heap
In C++, priority_queue is by default max heap.
To change it into a min heap, create a priority queue with a comparator:

```cpp
# This is a min heap
priority_queue<int, vector<int>, greater<int>> pq;
```

As you push values into the priority queue, it will still maintain a min heap.

### Make a priority queue from a given vector

Create a priority queue by passing vector's iterators:

```cpp
vector<int> nums = {1, 4, 2, 5, 3};
priority_queue<int> pq(numbers.begin(), numbers.end());
```

### Sample Code
```cpp
#include <vector>
#include <queue>

using namespace std;

int main() {
    std::vector<int> nums = {2, 3, 4, 1};

    // To make a heap from a given list, there are two ways:
    // 1. Using priority_queue
    std::priority_queue<int, std::vector<int>, std::greater<int>> pq;
    for (int n : nums) {
        pq.push(n);
    }
    // 2. Using make_heap (modifies the original vector)
    // std::make_heap(nums.begin(), nums.end(), std::greater<int>());
    int ans = 0;
    while (!pq.empty()) {
        int first = pq.top();
        pq.pop();

        if (pq.empty()) {
            break;
        }
        int second = pq.top();
        pq.pop();

        pq.push(first + second);
        ans += (first + second);
    }
    return 0;
}
```

### Comparison Table

| Python                  | C++                                                 |
| ----------------------- | --------------------------------------------------- |
| `import heapq`          | `#include <queue>`                                  |
| `heapq.heapify(nums)`   | `priority_queue<int> pq(nums.begin(), nums.end());` |
| `heapq.heappush(hq, n)` | `hq.push(n);`                                       |
| `n = heapq.heappop(hq)` | `int n = hq.top(); hq.pop();`                       |

### Reference to sample code
The sample code is from:

> There are two sorted piles of number cards. If the number of cards in each pile is A and B, then it usually takes A+B comparisons to merge the two piles into one. For example, 50 comparisons are needed to merge a pile of 20 number cards and a pile of 30 number cards. 
> 
> There are piles of number cards on the table. If you pick two piles and merge them, the number of comparisons will vary greatly depending on the order of selection. For example, if there are piles of 10, 20, and 40 cards, then if you merge the 10 and 20 cards, and then the combined 30 and 40 cards, you will need (10 + 20) + (30 + 40) = 100 comparisons. However, if you combine 10 and 40 cards, and then combine the combined 50-card bundle with the 20-card bundle, it is a less efficient method because (10 + 40) + (50 + 20) = 120 comparisons are required.
> 
> Write a program to find the minimum number of comparisons required when each size of a bundle of N number cards is given.
> 
> Translated from: https://www.acmicpc.net/problem/1715

