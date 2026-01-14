---
layout: post
title: "fork() vs. clone(): What is the difference?"
date: 2025-11-17 23:48:01
categories: TIL
---

## `fork()`

- `fork()` is the traditional system call that creates a new process.
- It does not take any parameters.

```c
#include <unistd.h>
pid_t fork(void);
```

## `clone()`

The problem is `clone()`. It also creates a new ("child") process, then how is it different from `fork()`?

> By contrast with fork(2), these system calls provide more precise control over what pieces of execution context are shared between the calling process and the child process.[^1]

That is why it is more **granular**, since it provides control over the resources shared between the parent and child. The `fork` system call did not allow any additional control other than creating a process.

The main use of `clone()` is to _implement_ threads,[^2] not create threads.[^3]

While `pthread_create()` is the standard POSIX way to create threads, it often utilizes `clone()` internally. In other words, `clone()` is the base which is used for the implementation of `pthread_create()` and all the family of the `fork()` system calls.

## Conclusion

- Use `fork()` if you only need to simply create a process in your code.
- `clone()` is something that is usually internally in Linux -> because it gives more control.
- Use `pthread_create()` to create a thread.

## Reference

[^1]: https://man7.org/linux/man-pages/man2/clone.2.html

[^2]: Slightly better explanation on the system call: https://linux.die.net/man/2/clone

[^3]: https://stackoverflow.com/questions/11662781/when-is-clone-and-fork-better-than-pthreads
