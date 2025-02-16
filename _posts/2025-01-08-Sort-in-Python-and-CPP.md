---
layout: post
title: Sort in Python and C++
date: 2025-02-16 12:26:20
description:
categories:
  - Data-Structure-and-Algorithms
tags:
  - sort
---

## Sort in Python

### 1. In-place method

This method sorts a list in-place, which means it modifies the original list directly without returning a new list.

```python
listA = [1, 5, 4, 3]
listA.sort()
```

By default, it sorts a list in ascending order (`[1, 3, 4, 5]`).
To sort it in descending order, use `reverse` parameter:

```python
listA = [1, 5, 4, 3]
listA.sort(reverse=True)
```

### 2. Return a new list

This method creates a new sorted list and does not modify the original list.

```python
listA = [1, 5, 4, 3]
sorted_listA = sorted(listA)
sorted_rv_listA = sorted(listA, reverse=True)
```

### 3. Key parameter

How to sort a lists of pairs? Use `key` paramter.

```python
listOfPairs = [(1, 4), (5, 2), (10, 7), (8, 9)]
# Sort by first item
sorted_listOfPairs = sorted(listOfPairs, key=lambda x: x[0])
# Sort by second item
sorted_listOfPairs = sorted(listOfPairs, key=lambda x: x[1])
```

## Sort in C++

### 1. Header file

`sort` is in \<algorithm\> header file.

```cpp
#include <algorithm>

using namespace std;
```

### 2. In-place method is default

By default, it modifies the original vector.

```cpp
vector<int> v = {1, 5, 4, 3};
sort(v.begin(), v.end());
```

As the same as Python, it sorts a list in ascending order (`{1, 3, 4, 5}`).

### 3. Return a new vector

If you want to return a new sorted vector without modifying the original one, create a new function, pass the original vector directly (not reference) and sort it inside:

```cpp
#include <vector>
#include <algorithm>

using namespace std;

vector<int> not_in_place_sort(vector<int>& original) {
    sort(original.begin(), original.end());
    return original;
}

int main() {
    vector<int> v = {1, 5, 3, 4};
    vector<int> v_sorted = not_in_place_sort(v);
    return 0;
}
```

### 4. Comparator

C++ sort has `comparator` parameter. `comparator` is optional.
With this comparator, you can sort a vector in descending order, you can sort a vector of pairs, etc.

### 5. Sort in descending order using comparator

```cpp
vector<int> v1 = {1, 3, 5, 4, 2};
sort(v1.begin(), v1.end(), greater<int>);
```

### 6. Sort a vector of pairs

For comparator, it should be a function that returns boolean value (binary function).

```cpp
bool comp(pair<int, int> left, pair<int, int> right) {
	return left.first < right.first;
}

sort(v.begin(), v.end(), comp);
```

Instead of defining a new function, you can use lambda function:

```cpp
sort(v.begin(), v.end(),
	[] (const auto& lhs, const auto& rhs) {
    return lhs.first < rhs.first;
    });
```
