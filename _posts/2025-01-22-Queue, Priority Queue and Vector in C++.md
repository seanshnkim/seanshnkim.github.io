---
layout: post
title: Queue, Priority Queue and Vector in C++
date: 2025-01-22 10:23:58
description: Convenient Cheat Sheet for queue, priority queue and vector methods in vector
categories:
  - Data-Structure-and-Algorithms
---

| Priority Queue                                           | Queue                     | Vector               |
| -------------------------------------------------------- | ------------------------- | -------------------- |
| `#include <queue>`                                       | `#include <queue>`        | `#include <vector>`  |
| `priority_queue<int>`<br>`pq(nums.begin(), nums.end());` | `queue<int> q;`           | `vector<int> v;`     |
| `hq.push(n);`                                            | `q.push(n);`              | `v.push_back(n);`    |
| `int n = hq.top();` <br>                                 | `int n = q.front();` <br> | `int n = v.front();` |
| `hq.pop();`                                              | `q.pop();`                | `v.pop_back();`      |
|                                                          | `int n = q.back();`       | `int n = v.back();`  |

### queue::pop() vs. queue::front()

The element removed is the "oldest" element in the [queue](https://cplusplus.com/queue) whose value can be retrieved by calling member [queue::front](https://cplusplus.com/queue::front).

```c++
#include <queue>
using namespace std;

int main() {
    queue<int> q;
    q.push(3);
    q.push(5);
    q.push(7);
    q.push(4);

    int front1 = q.front(); // front1 = 3
    q.pop();
    int front2 = q.front(); // front1 = 5
    return 0;
}
```
