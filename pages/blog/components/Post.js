import React from 'react'
import { documentToReactComponents } from '@contentful/rich-text-react-renderer'
import { BLOCKS } from '@contentful/rich-text-types'
import Link from 'next/link'

const getWordCount = node => {
  let count = 0
  if (node.nodeType === 'paragraph') {
    node.content.forEach(content => {
      switch (content.nodeType) {
        case 'text':
          count += content.value.split(' ').length
      }
    })
  } else if (node.nodeType === 'embedded-asset-block') {
    count += 80
  }

  return count
}

const makeContentPreview = content => {
  const wordLimit = 50
  let wordCount = 0
  const previewContent = []
  let counter = 0

  const { content: innerContent, ...others } = content

  while (wordCount < wordLimit && counter < innerContent.length) {
    previewContent.push(innerContent[counter])
    wordCount += getWordCount(innerContent[counter])
    counter++
  }

  return { ...others, content: previewContent }
}

const Post = ({ title, content, slug, preview, createdAt }) => {
  const options = {
    renderNode: {
      [BLOCKS.EMBEDDED_ASSET]: (node, children) => {
        // render the EMBEDDED_ASSET as you need
        return (
          <img
            src={node.data.target.fields.file.url}
            height={node.data.target.fields.file.details.image.height}
            width={node.data.target.fields.file.details.image.width}
            alt={node.data.target.fields.description}
          />
        )
      },
    },
  }

  return (
    <article className="blog-post__preview">
      {preview ? (
        <Link href={`/blog/${slug}`} legacyBehavior>
          <a>
            <h2>{title}</h2>
          </a>
        </Link>
      ) : (
        <h1>{title}</h1>
      )}
      <h4 className="blog-post__preview-date">
        {new Intl.DateTimeFormat('en-GB', {
          dateStyle: 'long',
        }).format(new Date(createdAt))}
      </h4>
      <div className="blog-post__preview-content">
        {documentToReactComponents(
          preview ? makeContentPreview(content) : content,
          options
        )}
      </div>
      {preview && (
        <Link href={`/blog/${slug}`} legacyBehavior>
          <a className="blog-post__preview-read-more">Read more...</a>
        </Link>
      )}
    </article>
  )
}

export default Post
