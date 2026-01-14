---
layout: default
permalink: /
title: post
nav: true
nav_order: 1
pagination:
  enabled: true
  collection: posts
  permalink: /page/:num/
  per_page: 10
  sort_field: date
  sort_reverse: true
  trail:
    before: 1 # The number of links before the current page
    after: 3 # The number of links after the current page
---

<div class="post">

{% assign blog_name_size = site.blog_name | size %}
{% assign blog_description_size = site.blog_description | size %}

<!-- Full-width layout with hover sidebar -->
<div class="blog-container">
  <div class="blog-main-content">

    <!-- Featured section: 1 large card + 3 small cards -->
    {% assign recent_posts = site.posts | slice: 0, 4 %}
    {% if recent_posts.size > 0 %}
    <div class="featured-grid">
      <!-- Large featured card (first post) -->
      {% assign featured_post = recent_posts[0] %}
      <div class="featured-large-card">
        <a href="{{ featured_post.url | relative_url }}" class="featured-card-link">
          {% if featured_post.thumbnail %}
          <div class="featured-large-img-container">
            <img src="{{ featured_post.thumbnail | relative_url }}" alt="{{ featured_post.title }}" class="featured-large-img">
          </div>
          {% endif %}
          <div class="featured-large-content">
            <h2 class="featured-large-title">{{ featured_post.title }}</h2>
            <p class="featured-large-excerpt">
              {% if featured_post.description and featured_post.description != "" %}
                {{ featured_post.description | strip_html | truncatewords: 30 }}
              {% else %}
                {{ featured_post.content | strip_html | truncatewords: 30 }}
              {% endif %}
            </p>
            <div class="featured-card-meta">
              <span class="featured-card-date">{{ featured_post.date | date: '%B %d, %Y' }}</span>
              {% if featured_post.categories.size > 0 %}
                <span class="featured-meta-separator">&middot;</span>
                <span class="featured-card-category">{{ featured_post.categories | first }}</span>
              {% endif %}
            </div>
          </div>
        </a>
      </div>

      <!-- Small featured cards (next 3 posts) -->
      <div class="featured-small-cards">
        {% for i in (1..3) %}
          {% assign small_post = recent_posts[i] %}
          {% if small_post %}
          <div class="featured-small-card">
            <a href="{{ small_post.url | relative_url }}" class="featured-card-link">
              <div class="featured-small-content">
                <div class="featured-small-text">
                  <h3 class="featured-small-title">{{ small_post.title }}</h3>
                  <p class="featured-small-excerpt">
                    {% if small_post.description and small_post.description != "" %}
                      {{ small_post.description | strip_html | truncatewords: 20 }}
                    {% else %}
                      {{ small_post.content | strip_html | truncatewords: 20 }}
                    {% endif %}
                  </p>
                  <div class="featured-card-meta">
                    <span class="featured-card-date">{{ small_post.date | date: '%b %d, %Y' }}</span>
                    {% if small_post.categories.size > 0 %}
                      <span class="featured-meta-separator">&middot;</span>
                      <span class="featured-card-category">{{ small_post.categories | first }}</span>
                    {% endif %}
                  </div>
                </div>
                {% if small_post.thumbnail %}
                <div class="featured-small-img-container">
                  <img src="{{ small_post.thumbnail | relative_url }}" alt="{{ small_post.title }}" class="featured-small-img">
                </div>
                {% endif %}
              </div>
            </a>
          </div>
          {% endif %}
        {% endfor %}
      </div>
    </div>
    {% endif %}

  <ul class="post-list">

    {% if page.pagination.enabled %}
      {% assign postlist = paginator.posts %}
    {% else %}
      {% assign postlist = site.posts %}
    {% endif %}

    {% for post in postlist %}

    {% if post.external_source == blank %}
      {% assign read_time = post.content | number_of_words | divided_by: 180 | plus: 1 %}
    {% else %}
      {% assign read_time = post.feed_content | strip_html | number_of_words | divided_by: 180 | plus: 1 %}
    {% endif %}
    {% assign year = post.date | date: "%Y" %}
    {% assign tags = post.tags | join: "" %}
    {% assign categories = post.categories | join: "" %}

  <li data-post-url="{{ post.url | relative_url }}">

{% if post.thumbnail %}

<div class="row">
          <div class="col-sm-9">
{% endif %}
        <h3>
        {% if post.redirect == blank %}
          <a class="post-title" href="{{ post.url | relative_url }}">{{ post.title }}</a>
        {% elsif post.redirect contains '://' %}
          <a class="post-title" href="{{ post.redirect }}" target="_blank">{{ post.title }}</a>
          <svg width="2rem" height="2rem" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
            <path d="M17 13.5v6H5v-12h6m3-3h6v6m0-6-9 9" class="icon_svg-stroke" stroke="#999" stroke-width="1.5" fill="none" fill-rule="evenodd" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        {% else %}
          <a class="post-title" href="{{ post.redirect | relative_url }}">{{ post.title }}</a>
        {% endif %}
      </h3>
      <p>{{ post.description }}</p>
      <p class="post-meta">
        {{ read_time }} min read &nbsp; &middot; &nbsp;
        {{ post.date | date: '%B %d, %Y' }}
        {% if post.external_source %}
        &nbsp; &middot; &nbsp; {{ post.external_source }}
        {% endif %}
      </p>
      <p class="post-tags">
          {% if categories != "" %}
          &nbsp; &middot; &nbsp;
            {% for category in post.categories %}
            <a href="{{ category | slugify | prepend: '/blog/category/' | prepend: site.baseurl}}">
              <i class="fa-solid fa-tag fa-sm"></i> {{ category }}</a>
              {% unless forloop.last %}
                &nbsp;
              {% endunless %}
              {% endfor %}
          {% endif %}
    </p>

{% if post.thumbnail %}

</div>

  <div class="col-sm-3">
    <img class="card-img" src="{{ post.thumbnail | relative_url }}" style="object-fit: cover; height: 90%" alt="image">
  </div>
</div>
{% endif %}
    </li>

    {% endfor %}

  </ul>

{% if page.pagination.enabled %}
{% include pagination.liquid %}
{% endif %}

  </div><!-- End blog-main-content -->

</div><!-- End blog-container -->

<!-- Hover-activated sidebar -->
<div class="category-sidebar-hover" aria-label="Categories">
  <div class="sidebar-tab">
    <span class="sidebar-tab-icon">☰</span>
    <span class="sidebar-tab-text">Categories</span>
  </div>
  <div class="sidebar-content">
    <h3 class="category-sidebar-title">Categories</h3>
    {% assign open_after = site.sidebar_open_categories | default: 0 %}
    {% for category in site.display_categories %}
      {% assign idx = forloop.index0 %}
      {% assign posts_in_cat = site.posts | where_exp: "post", "post.categories contains category" %}
      {% assign post_count = posts_in_cat | size %}
      {% if idx < open_after %}
        <details class="category-item" open>
      {% else %}
        <details class="category-item">
      {% endif %}
        <summary data-count="{{ post_count }}">{{ category }}</summary>
        <ul>
          {% for p in posts_in_cat %}
            <li><a href="{{ p.url | relative_url }}">{{ p.title }}</a></li>
          {% endfor %}
        </ul>
      </details>
    {% endfor %}
  </div>
</div>

</div><!-- End post -->
