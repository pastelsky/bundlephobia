import { useRouter } from 'next/router'
import React from 'react'
import BlogLayout from './BlogLayout'
import { useContentful } from 'react-contentful'
import BlogPost from './Post'
import ContentfulProvider from './ContentfulProvider'

const ArticleWithContent = () => {
  return (
    <ContentfulProvider>
      <BlogLayout className="blog">
        <Article />
      </BlogLayout>
    </ContentfulProvider>
  )
}

const Article = () => {
  const { router } = useRouter()

  console.log('router is ', router)
  const { data, error, loading } = useContentful({
    contentType: 'blogPost',
  })

  if (loading) {
    return 'Loading...'
  } else if (error) {
    return (
      <pre>
        <code>{error}</code>
      </pre>
    )
  } else if (data) {
    return (
      <>
        {data.items.map(item => (
          <BlogPost
            key={item.fields.title}
            title={item.fields.title}
            content={item.fields.content}
            slug={item.fields.slug}
            createdAt={item.fields.createdAt || item.sys.createdAt}
          />
        ))}{' '}
      </>
    )
  }

  return 'Loading...'
}

export default ArticleWithContent
