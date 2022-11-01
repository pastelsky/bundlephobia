import ResultLayout from '../ResultLayout'

const BlogLayout = ({ className, children }) => {
  return (
    <ResultLayout className={className}>
      <div className="blog-layout__container">{children}</div>
    </ResultLayout>
  )
}

export default BlogLayout
