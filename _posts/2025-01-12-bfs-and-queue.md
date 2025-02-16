---
layout: post
title: BFS (Breadth First Search) and Queue
date: 2025-01-10 12:39:12
description:
categories:
  - Data-Structure-and-Algorithms
tags:
  - BFS
  - queue
---

# BFS is queue

BFS (Breadth First Search) algorithm uses a data structure called queue.

The basic structure of the algorithm is:

```python
a = 3
for i in range(3):
  print(a)
```

```cpp
queue<TreeNode*> q;
q.push(root);

while (!q.empty()) {
  int qSize = q.size();

	while(qSize--) {
		TreeNode* node = q.front();
		q.pop();

		// Do something with the current node
		// ...

		if (node->left != nullptr) {
			q.push(node->left);
		}
		if (node->right != nullptr) {
			q.push(node->right);
		}
	}
}
```

Or more simplified version:

```cpp
queue<TreeNode*> q;
q.push(root);

while (!q.empty()) {
	TreeNode* node = q.front();
	q.pop();

	// Do something with the current node
	// ...

	if (!node) continue;

	q.push(node->left);
	q.push(node->right);
}
```

## 1. Same Tree

Given the roots of two binary trees `p` and `q`, return `true` if the trees are **equivalent**, otherwise return `false`.

Two binary trees are considered **equivalent** if they share the exact same structure and the nodes have the same values.

```cpp
bool isSameTree(TreeNode* p, TreeNode* q) {
	queue<TreeNode*> q1;
	queue<TreeNode*> q2;
	q1.push(p);
	q2.push(q);

	while (!q1.empty() && !q2.empty()) {
		TreeNode nodeP = q1.front();
		q1.pop();
		TreeNode nodeQ = q2.front();
		q2.pop();

		if (!nodeP && !nodeQ) {
			continue;
		}
		if (!nodeP || !nodeQ || nodeP->val != nodeQ->val) {
			return false;
		}
		q1.push(nodeP->left);
		q1.push(nodeP->right);
		q2.push(nodeP->left);
		q2.push(nodeP->right);
	}
	return true;
}
```

Note that this code is equivalent to

```cpp
bool isSameTree(TreeNode* p, TreeNode* q) {
	if (!p && !q) {
		return true;
	}
	if ( (!q || !p) || (p->val != q->val) ) {
		return false;
	}
	return isSameTree(p->left, q->left) && isSameTree(p->right, q->right);
}
```

## 2. Symmetric Tree

Given the `root` of a binary tree, _check whether it is a mirror of itself_ (i.e., symmetric around its center).

```cpp
// C++
class Solution {
public:
    bool isSymmetric(TreeNode* root) {
        queue<TreeNode*> q;
        q.push(root);
        q.push(root);
        while (!q.empty()) {
            TreeNode* t1 = q.front();
            q.pop();
            TreeNode* t2 = q.front();
            q.pop();
            if (t1 == NULL && t2 == NULL) continue;
            if (t1 == NULL || t2 == NULL) return false;
            if (t1->val != t2->val) return false;
            q.push(t1->left);
            q.push(t2->right);
            q.push(t1->right);
            q.push(t2->left);
        }
        return true;
    }
};
```

Some problems can be solved with both DFS and with BFS.
