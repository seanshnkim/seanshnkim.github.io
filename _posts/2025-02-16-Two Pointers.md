---
layout: post
title: Two Pointers
date: 2025-02-16 10:53:46
description: Different approaches to solve two pointer algorithm problems
categories:
  - Data-Structure-and-Algorithms
---

## Two pointer approach in sorted array

Two pointer approach is available when given array is sorted.

Let's look into [3sum](https://neetcode.io/problems/three-integer-sum) problem.

### What I missed
It is always good to 


```cpp
class Solution {
    public:
        // I should aim for a solution with O(n^2) time complexity and O(1) space
        vector<vector<int>> threeSum(vector<int>& nums) {
            vector<vector<int>> res;
            // Sorting is allowed, because its time complexity is O(nlogn)
            // And O(nlogn) < O(n^2)
            sort(nums.begin(), nums.end());
            int N = nums.size();
            
            for (int i = 0; i < N-2; i++) {
                // Remove duplicate triplets
                if (i > 0 && nums[i] == nums[i-1]) {
                    continue;
                }
                int target = -1 * nums[i];
                int left = i+1, right = N-1;
    
                while (left < right) {
                    if (nums[left] + nums[right] == target) {
                        res.push_back({nums[i], nums[left], nums[right]});
                        left++;

                        while (left < right && nums[left] == nums[left-1]) {
                            left++;
                        }
                    }
                    else if (nums[left] + nums[right] < target) {
                        left++;
                    }
                    else {
                        right--;
                    }
                }
            }
            return res;
        }
    };
```