---
layout: post
title: List and vector in Python and in C++
date: 2025-01-09 12:43:20
categories:
  - Data-Structure-and-Algorithms
tags:
  - list
  - vector
---

In Python, initializing a list is simple:

```python
N = 5
nested_lists = [[] for _ in range(N)]
list_with_zeros = [0]*N
```

In C++, `vector` can be used as an equivalent to `list` in python.

```cpp
#include <vector>

int main() {
	int N = 5;
	vector<vector<int>> nested_vector(N);
	vector<int> vector_with_zeros(N, 0);
	return 0;
}
```

`vector` in C++ is (like `list` in Python) dynamically allocated, so it can be initialized without specifying its size or values:

```cpp
vector<int> v;
for (int i=0; i < N; ++i) {
	v.push_back(0);
};
```

But this code `vector<int> vector_with_zeros(N, 0);` obviously looks better than the for-loop initialization.

### Comparison Table

| Python        | C++                        |
| ------------- | -------------------------- |
| -             | `#include <vector>`        |
| `l = [1,2,3]` | `vector<int> l = {1,2,3};` |
| `l = [0] * N` | `vector<int> l(N, 0);`     |
| `len(l)`      | `int l_size = l.size();`   |
| `if is not l` | `if (!l.empty() )`         |
| `l.append(4)` | `l.push_back(4);`          |
| `l[0]`        | `l.front();`               |
| `l[-1]`       | `l.back();`                |
