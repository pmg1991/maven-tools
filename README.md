# Online Maven Download Tool

A web-based Maven dependency resolver and JAR downloader that resolves transitive dependencies and downloads them as a ZIP file.

**Live Demo:** https://maven-tools.mohants.com/

## Features

- **Client-side dependency resolution**: Full Maven POM parsing and dependency resolution happens in the browser
- **Transitive dependency resolution**: Automatically resolves all transitive dependencies including parent POMs
- **Version conflict resolution**: Uses depth-based conflict resolution (shallowest depth wins)
- **Scope filtering**: Filters out test and provided dependencies
- **Optional dependency filtering**: Skips optional dependencies
- **Dependency tree visualization**: Displays hierarchical dependency tree with conflict information and direct download links
- **ZIP download**: Downloads all resolved JARs as a single ZIP file
- **POM generation**: Generate a pom.xml file from the dependency list
- **Netlify Edge Functions**: Serverless proxy for Maven Central with streaming support

## Requirements

- Netlify account (for deployment)
- No server requirements - fully client-side with Netlify Edge Functions

## Installation

1. Clone or download this repository
2. Deploy to Netlify:
   - Connect your repository to Netlify
   - Or use Netlify CLI: `netlify deploy --prod`
3. The Edge Function will automatically handle Maven Central requests

## Usage

1. Enter Maven dependencies in the text area (XML format):
   ```xml
   <dependency>
       <groupId>com.example</groupId>
       <artifactId>example-lib</artifactId>
       <version>1.0.0</version>
   </dependency>
   ```
2. Click "Resolve Jars" to:
   - Resolve all transitive dependencies
   - Display dependency tree with direct download links
3. Click "Download All as ZIP" to download all resolved JARs
4. Click "Generate POM" to download a pom.xml file

## Architecture

- **netlify/functions/fetch.js**: Edge Function that fetches files from Maven Central with streaming support
- **index.html**: Frontend with client-side Maven dependency resolution
- **script.js**: Client-side dependency resolution logic
- **styles.css**: White theme styling
- **JSZip**: Client-side ZIP creation library (loaded from CDN)

## Security

- URL validation: Only allows requests to Maven repository URLs
- File type validation: Only allows .jar and .pom files
- No server-side file execution: All resolution happens client-side
- Netlify Edge Functions provide secure proxy with CORS headers

## License

MIT License - see LICENSE file for details
