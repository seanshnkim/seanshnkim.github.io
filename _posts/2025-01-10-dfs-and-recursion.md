---
layout: post
title: DFS (Depth First Search) and Recursion
date: 2025-01-10 12:35:44
description:
categories:
  - Data-Structure-and-Algorithms
tags:
  - DFS
  - Recursion
---

# DFS is recursion

DFS(Depth First Search) is a recursive algorithm.
It repeats the same search procedure down through child nodes but increasing the depth by one.
To get a better grasp of the concept, let's dive into code right away.

## 1. Find max depth in binary tree

1. Base condition
2. Recursion = relationship

```cpp
int maxDepth(TreeNode* root) {
	if (!root) {
		return 0;
	}
	int leftDepth = maxDepth(root->left);
	int rightDepth = maxDepth(root->right);
	
	return 1 + max(leftDepth, rightDepth);
}
```


## 2. Balanced binary tree

Given a binary tree, determine if it is a height-balanced tree (a binary tree in which the depth of the two subtrees of every node never differs by more than one).

### First solution

1. Analyze given question. What defines a "height-balance" tree?
2. Base condition.
3. Recursion = relationship
4. Set if-statements (conditions, restraints).
5. Consider using a helper function.

```cpp
bool isBalanced(TreeNode* root) {
	if (!root) {
		return true;
	}
	int leftH = getHeight(root->left);
	int rightH = getHeight(root->right);

	if (!isBalanced(root->left)) {
		return false;
	}
	if (!isBalanced(root->right)) {
		return false;
	}
	if (abs(leftH - rightH) > 1) {
		return false;
	}
	return true;
}

int getHeight(TreeNode* node) {
	if (!node) {
		return -1;
	}
	return 1 + max(getHeight(node->left), getHeight(node->right));
}
```


### Second solution
First solution is easier to understand, but is slower.
Second solution uses `-1` as a return value to tell if it is a balanced tree.

```cpp
bool isBalanced(TreeNode* root) {
	return getHeight(root) != -1;
}

int getHeight(TreeNode* node) {
	if (!node) {
		return 0;
	}

	int left = getHeight(node->left);
	int right = getHeight(node->right);

	// left, right subtree is unbalanced or cur tree is unbalanced
	if (left == -1 || right == -1 || abs(left - right) > 1) {
		return -1;
	}

	return max(left, right) + 1;
}
```


## 3. Minimum depth of binary tree

1. Analyze given condition: if the child node is NULL (no node), it does not count. Only a leaf node has valid depth value.
2. Used a function parameter to pass `depth`
3. After all, setting if-statements (conditions) matters.

```cpp
int minDepth(TreeNode* root) {
	return min_dfs(root, 1);
}
int min_dfs(TreeNode *node, int depth) {
	if (!node) {
		return depth-1;
	}
	if (!node->left && !node->right) {
		return depth;
	}
	else if (!node->left) {
		return min_dfs(node->right, depth+1);
	}
	else if (!node->right) {
		return min_dfs(node->left, depth+1);
	}
	else {
		return min(min_dfs(node->left, depth+1), min_dfs(node->right, depth+1) );
	}
}
```

Before writing code, it always helps writing a binary table.
In this case, every possible condition can be broken down into four if-statements.

| left node | right node | depth                |
| --------- | ---------- | -------------------- |
| not NULL  | not NULL   | 1 + min(left, right) |
| not NULL  | NULL       | 1 + depth(left)      |
| NULL      | not NULL   | 1 + depth(right)     |
| NULL      | NULL       | 1                    |

This is a code without an additional parameter:

```cpp
int minDepth(TreeNode* root) {
	if (!root) {
		return 0;
	}
	int leftH = minDepth(root->left);
	int rightH = minDepth(root->right);

	if (leftH == 0 && rightH == 0) {
		return 1;
	}
	if (leftH == 0) {
		return rightH + 1;
	}
	if (rightH == 0){
		return leftH + 1;
	}
	return min(leftH, rightH) + 1;
}
```