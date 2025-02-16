---
layout: post
title: Array and Hashing Part 1
date: 2025-02-02 10:08:01
description: How to handle array and hash map & set
categories: Data-Structure-and-Algorithms
---

## Group Anagrams

- There are 26 alphabetics in English. By using a vector variable `count = [0]*26`, we can save counts for each letter in (yes, it is technically O(26) ) time complexity of O(1).

```python
class Solution:
    def convert2key(self, s: str) -> str:
        alph_cnt = [0]*26

        # time complexity: O(n + 26)
        for c in s:
            alph_cnt[ord(c) - ord('a')] += 1

        key = ""
        for i in range(26):
            key += chr(i + ord('a')) * alph_cnt[i]

        return key


    def groupAnagrams(self, strs: List[str]) -> List[List[str]]:
        keyMap = {}
        res = []

        # time complexity:  O(m*n + 26*m)
        for s in strs:
            key = self.convert2key(s)

            if key not in keyMap:
                keyMap[key] = [s]
            else:
                keyMap[key].append(s)

        for key, listOfStr in keyMap.items():
            res.append(listOfStr)

        return res
```

## Top K Frequent Elements

```cpp
class Solution {
public:
    vector<int> topKFrequent(vector<int>& nums, int k) {
        int N = nums.size();
        // buckets[i] = j -> i is count, j is the number
        vector<vector<int>> buckets(N+1);
        unordered_map<int, int> countMap;

        for (int n : nums) {
            countMap[n] += 1;
        }

        for (const auto& pair: countMap) {
            int n = pair.first;
            int nCnt = pair.second;
            buckets[nCnt].push_back(n);
        }
        vector<int> res;
        int i = 0;

        while (k > 0 || i < N) {
            if (!buckets[N-i].empty()) {
                for (int m: buckets[N-i]) {
                    res.push_back(m);
                    k--;
                    if (k == 0) {
                        return res;
                    }
                }
            }
            i++;
        }

    }
};
```

## Encode and Decode Strings

```cpp
class Solution {
public:
    string encode(vector<string>& strs) {
        string res;
        for (const string& s: strs) {
            res += to_string(s.size()) + "#" + s;
        }
        return res;
    }

    vector<string> decode(string s) {
        vector<string> res;

        int start = 0;
        while (start < s.size()) {
            int end = start;
            while (s[end] != '#') {
                end++;
            }
            // length can be two-digit number or more
            int length = stoi(s.substr(start, end - start));
            start = end + 1;

            res.push_back(s.substr(start, length));
            start += length;
        }
        return res;
    }
};

```

## First Unique Character in a String

Compared to my first solution:

```c++
class Solution {
public:
    int firstUniqChar(string s) {
        unordered_map<char, int> nonRepChar;

        for (int i = 0; i < s.size(); i++) {
            char c = s[i];
            if (nonRepChar.find(c) == nonRepChar.end()) {
                nonRepChar[c] = i;
            }
            else {
                nonRepChar[c] = -1;
            }
        }
        int firstIdx = -1;
        for (const auto& pair: nonRepChar) {
            if (pair.second == -1) {
                continue;
            }
            else {
                if (firstIdx == -1) {
                    firstIdx = pair.second;
                }
                else {
                    firstIdx = min(firstIdx, pair.second);
                }
            }
        }
        return firstIdx;
    }
};
```

The second solution is better:

```cpp
class Solution {
public:
    int firstUniqChar(string s) {
        unordered_map<char, int> count;

        for (char c : s) {
	        // C++ unordered_map works like defaultdict(int) in Python
            count[c]++;
        }
        for (int i = 0; i < s.size(); i++) {
	        // non-repeating character has the count value of 1
            if (count[s[i]] == 1) {
                return i;
            }
        }
        return -1;
    }
};
```

## Best Time to Buy and Sell Stock

First solution:

```cpp
class Solution {
public:
    int maxProfit(vector<int>& prices) {
        int profit = 0;
        int sell = prices[0], buy = prices[0];

        for (int price : prices) {
            if (price > sell) {
                sell = price;
            }
            if (price < buy) {
                buy = price;
                sell = buy;
            }
            profit = max(profit, sell - buy);
        }
        return profit;
    }
};
```

-> For every for loop, you must update the maximum profit. (I did not in the first try, got wrong)

Second solution:

```cpp
class Solution {
public:
    int maxProfit(vector<int>& prices) {
        int l = 0, r = 1;
        int maxProfit = 0;

        while (r < prices.size()) {
            if (prices[l] < prices[r]) {
                maxProfit = max(maxProfit, prices[r] - prices[l]);
            }
            else {
                l = r;
            }
            r++;
        }
        return maxProfit;
    }
};
```

```python
class Solution:
    def maxProfit(self, prices: List[int]) -> int:
        start = 0
        end = 0
        profit = 0
        N = len(prices)
        for i in range(N):
            if prices[i] < prices[start]:
                start = i
                end = i
            elif prices[i] > prices[end]:
                end = i
                profit = max(profit, prices[end] - prices[start])
        return profit
```

# P1. Valid Anagram

### First solution

```c++
bool isAnagram(string s, string t) {
	unordered_map<char, int> sMap;
	for (char c: s) {
		if (sMap.find(c) != sMap.end()) {
			sMap[c] += 1;
		}
		else {
			sMap[c] = 1;
		}
	}
	for (char c: t) {
		if (sMap.find(c) == sMap.end()) {
			return false;
		}
		else {
			sMap[c]--;
		}
	}
	for (const auto& [key, value] : sMap) {
		if (value != 0) {
			return false;
		}
	}
	return true;
}
```

What determines the two strings to be anagrams of each other?

1. If there is a character in string `s`, then the same character must exist in string `t` as well
2. The count of each character is the same

3. There are total three for loops. Save each count of characters in string s in `sMap`
4. For each character of string t, decrease the count of the character
5. If the value (count) of sMap is not 0, it means it is not an anagram

However, the solution above is quite long. It can be shorter:

### Second solution

```c++
bool isAnagram(string s, string t) {
	if (s.length() != t.length()) {
		return false;
	}

	unordered_map<char, int> countS;
	unordered_map<char, int> countT;
	for (int i = 0; i < s.length(); i++) {
		countS[s[i]]++;
		countT[t[i]]++;
	}
	return countS == countT;
}
```

6. First it checks if lengths of the two strings are the same. If the lengths are not equal, it will return false and exit the function. Afterwards it runs a for loop with the same iterator (`int i`) in string s and t, so the lengths of the two strings must be the same.
7. It uses a map for each string -> total two maps
8. Lastly, it compares two maps

### Third solution

```c++
bool isAnagram(string s, string t) {
	if (s.length() != t.length()) {
		return false;
	}

	vector<int> count(26, 0);
	for (int i = 0; i < s.length(); i++) {
		count[s[i] - 'a']++;
		count[t[i] - 'a']--;
	}

	for (int val : count) {
		if (val != 0) {
			return false;
		}
	}
	return true;
}
```

Instead of using a map (unordered_map), it uses a vector. How is this possible?
It uses ASCII value of each character, and it enables to map a character to an integer.

In the same for loop, it increments and decrements at the same time.

# P2. Two Sum

```python
def twoSum(self, nums: List[int], target: int) -> List[int]:
	hashDict = {}
	for i in range(len(nums)):
		hashDict[nums[i]] = i

	for i in range(len(nums)):
		n = nums[i]
		if (target-n) in hashDict and \
		hashDict[target-n] != i:
			return [i, hashDict[target-n]]
```

```c++
vector<int> twoSum(vector<int>& nums, int target) {
	unordered_map<int, int> hashMap;
	int i = 0, j = 1;
	for (int k=0; k < nums.size(); k++) {
		hashMap[nums[k]] = k;
	}
	for (int k=0; k < nums.size(); k++) {
		int diff = target - nums[k];
		i = k;
		// j = hashMap.find(diff)->second;
		if (hashMap.find(diff) != hashMap.end()) {
			j = hashMap.find(diff)->second;
			if (j != i) {
				break;
			}
		}
	}
	return vector<int> {i, j};
}
```
