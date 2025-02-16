---
layout: post
title: Bit Manipulation
date: 2025-01-20 20:14:11
description: Bit manipulations and useful techniques
categories:
  - Data-Structure-and-Algorithms
---
## P1. Single Number (XOR)

- XOR has a property in which:
	- 0 ^ a = a
	- a ^ 0 = a
	- a ^ a = 0
	- (a ^ b) ^ b = a

You are given a **non-empty** array of integers `nums`. Every integer appears twice except for one.
Return the integer that appears only once.
You must implement a solution with O(n)O(n) runtime complexity and use only O(1)O(1) extra space.

```python
def singleNumber(self, nums: List[int]) -> int:
	xor = 0
	for n in nums:
		xor ^= n
	return xor
```

## P2. Number of One Bits (AND)

This algorithm is also known as Brian Kernighan's algorithm:
- Subtract 1 from a number N, then N-1
- In N-1, all the bits after the rightmost 1 (including that 1) are flipped
- So if N AND N-1, then it will clear out (set to 0) the rightmost bits


```python
def hammingWeight(self, n: int) -> int:
	res = 0
	while n:
		n &= n - 1
		res += 1
	return res
```

```C++
int hammingWeight(uint32_t n) {
	int res = 0;
	while (n) {
		n &= n-1;
		res++;
	}
	return res;
}
```

```
// For example, let's say n = 10111 (2)
n   = 10111
n-1 = 10110
&   = 10110 -> It clears out 0th bit (which was previously 1)

n   = 10110
n-1 = 10101
&   = 10100 -> It clears out 1st bit (which was previously 1)

n   = 10100
n-1 = 10011
&   = 10000 -> It clears out 2nd bit (which was previously 1)

n   = 10000
n-1 = 01111
&   = 00000 -> It clears out 4th bit (which was previously 1)
```

### Time Complexity

- Instructions in the while loop is executed only if the kth bit is set to 1.
- A given number N (in binary form) has at most logN bits that are set to 1.
- Therefore, time complexity is O(log N).


---
## P3. Counting Bits

- Given that a, b, c, d and e each represents bits in binary number
- Let's assume there is a function `countBitsFromBinary()`

```
countBitsFromBinary(abcde) # abcde is a binary
= countBitsFromBinary(abcd) + countBitsFromBinary(e)
= countBitsFromBinary(abcde >> 1) + e & 1
```

Now let's look at the code:

```c++
vector<int> countBits(int n) {
	vector<int> dp(n+1, 0);
	for (int i=0; i <= n; i++) {
		dp[i] = dp[i >> 1] + (i & 1);
	}
	return dp;
}
```


---

## P4. Reverse Bits

```C++
uint32_t reverseBits(uint32_t n) {
	uint32_t res = 0;

	for (int i=0; i < 32; i++) {
		uint32_t bit = (n >> i) & 1;
		res |= bit << (31-i);
	}
	return res;
}
```


---
## P5. Missing Number

