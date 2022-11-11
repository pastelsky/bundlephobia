import React from 'react'
import { BlogLayout } from '../../client/components/BlogLayout'
import { useContentful } from 'react-contentful'
import { Separator } from '../../client/components/Separator'
import Post from './components/Post'
import ContentfulProvider from './components/ContentfulProvider'

const BlogWithContent = () => {
  return (
    <ContentfulProvider>
      <BlogLayout className="blog">
        <BlogHome />
      </BlogLayout>
    </ContentfulProvider>
  )
}

const BlogHome = () => {
  const { data, error, loading } = useContentful({
    contentType: 'blogPost',
  })

  let content = null

  if (loading) {
    content = 'Loading...'
  } else if (error) {
    content = (
      <pre>
        <code>{error}</code>
      </pre>
    )
  } else if (data) {
    content = (
      <>
        {data.items.map(item => (
          <Post
            key={item.fields.title}
            title={item.fields.title}
            content={item.fields.content}
            slug={item.fields.slug}
            createdAt={item.fields.createdAt || item.sys.createdAt}
            preview={true}
          />
        ))}{' '}
      </>
    )
  }

  return (
    <>
      <h1> Blogosphere </h1>
      <Separator
        text=""
        align="normal"
        showLeft={false}
        containerStyles={{ marginBottom: '2rem' }}
      />
      {content}
    </>
  )
}

export default BlogWithContent
