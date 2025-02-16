---
layout: post
title: Heap and Priority Queue Problems
date: 2025-01-21 21:36:32
description:
categories: Data-Structure-and-Algorithms
---


# P1. Kth Largest Element in a Stream

My first solution:

```python
def __init__(self, k: int, nums: List[int]):
	heapq.heapify(nums)
	for _ in range(len(nums) - k):
		heapq.heappop(nums)
	
	self.k = k
	self.nums = nums

def add(self, val: int) -> int: 
	heapq.heappush(self.nums, val)
	res = heapq.heappop(self.nums)

	if len(self.nums) < self.k:
		heapq.heappush(self.nums, res)
		return res

	res = heapq.heappop(self.nums)
	heapq.heappush(self.nums, res)
	return res
```


Simpler code:

```python
def __init__(self, k: int, nums: List[int]):
	self.minHeap, self.k = nums, k
	heapq.heapify(self.minHeap)
	while len(self.minHeap) > k:
		heapq.heappop(self.minHeap)

def add(self, val: int) -> int:
	heapq.heappush(self.minHeap, val)
	if len(self.minHeap) > self.k:
		heapq.heappop(self.minHeap)
	return self.minHeap[0]
```

In C++:

```c++
class KthLargest {
private:
    int k;
    priority_queue<int, vector<int>, greater<int>> minHeap;
public:
    KthLargest(int k, vector<int>& nums) {
        for (int n: nums) {
            minHeap.push(n);
            if (minHeap.size() > k) {
                minHeap.pop();
            }
        }
        this->k = k;
    }
    
    int add(int val) {
        this->minHeap.push(val);
        if (this->minHeap.size() > this->k) {
            this->minHeap.pop();
        }
        return this->minHeap.top();
    }
};
```

- In C++, shared variables (`minHeap`, `k`) need to be declared first as private.
- It is better to use a for-loop once than twice.


---
# P2. Last Stone Weight

First solution:

```c++
class Solution {
public:
    int lastStoneWeight(vector<int>& stones) {
        priority_queue<int> pq;
        for (int s: stones) {
            pq.push(s);
        }
        while (!pq.empty()) {
            int m1 = pq.top();
            pq.pop();
            if (pq.empty()) {
                return m1;
            }
            int m2 = pq.top();
            pq.pop();

            int diff = m1 - m2;
            if (diff > 0) {
                pq.push(diff);
            }
        }
        return 0;
    }
};

```

Second solution:

```c++
class Solution {
public:
    int lastStoneWeight(vector<int>& stones) {
        priority_queue<int> maxHeap(stones.begin(), stones.end());
        
        while (maxHeap.size() > 1) {
            int s1 = maxHeap.top();
            maxHeap.pop();
            int s2 = maxHeap.top();
            maxHeap.pop();
            
            if (s1 - s2 > 0) {
                maxHeap.push(diff);
            }
        }
        if (maxHeap.empty()) {
            return 0;
        }
        else {
            return maxHeap.top();
        }
    }
};
```

