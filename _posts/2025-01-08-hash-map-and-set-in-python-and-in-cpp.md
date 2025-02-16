---
layout: post
title: Hash map and set in Python and in C++
date: 2025-01-08 12:30:20
categories:
  - Data-Structure-and-Algorithms
tags:
  - hash
  - map
  - set
---

## Hash map in Python

Hash map is simply a dictionary in Python.

### Sample Code

```python
# Define dictionary
indices = {}

nums = [3, 4, 5, 6]

for i, n in enumerate(nums):
	indices[n] = i

for i, n in enumerate(nums):
	diff = target - n
	if diff in indices and indices[diff] != i:
		return [i, indices[diff]]
```

## Hash Map in C++

### 1. header file
```cpp
#include <unordered_map>
```

### 2. Define
There needs to be two values:
```cpp
unordered_map<int, int> hashMap;
```

You have to pre-define each type of key and pair of the dictionary, unlike dictionary in Python:

```cpp
// It has string as its value
unordered_map<int, string> hashStrMap;
```


### 3. Sample code
```cpp
class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        int n = nums.size();
        unordered_map<int, int> indices;

        for (int i = 0; i < n; i++) {
            indices[nums[i]] = i;
        }
        for (int i = 0; i < nums.size(); i++) {
            int diff = target - nums[i];
            if (indices.count(diff) && indices[diff] != i) {
                return {i, indices[diff]};
            }
        }
    }
};
```


## Map Comparison Table (Python vs. C++)

| Python           | C++                                     |
| ---------------- | --------------------------------------- |
| -                | `#include <unordered_map>`              |
| `hashMap = {}`   | `unordered_map<int, int> hashMap;`      |
| `hashMap[1] = 3` | `hashMap[1] = 3; myMap.insert({1, 1});` |
|                  |                                         |


## Set in Python

```python
def hasDuplicate(self, nums: List[int]) -> bool:
	setDup = set()
	for n in nums:
		if n in setDup:
			return True
		else:
			setDup.add(n)
	return False
```

## Set in C++

```c++
bool hasDuplicate(vector<int>& nums) {
	unordered_set<int> uset;
	for (int i: nums) {
		if (uset.find(i) != uset.end()) {
			return true;
		}
		else {
			uset.insert(i);
		}
	}
	return false;
}
```


## Set Comparison Table (Python vs. C++)

| Python            | C++                           |
| ----------------- | ----------------------------- |
| -                 | `#include <unordered_set>`    |
| `hashSet = set()` | `unordered_set<int> hashSet;` |
| `hashSet.add(3)`  | `hashSet.insert(3);`          |
