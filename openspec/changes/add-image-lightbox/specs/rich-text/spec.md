## ADDED Requirements

### Requirement: Image thumbnails
Where formatted text is displayed, images SHALL be shown as thumbnails no larger than 320×240 pixels, keeping their proportions and never wider than the text around them. Each thumbnail SHALL be a control labelled «Открыть изображение». The editor SHALL keep showing images as before.

#### Scenario: A pasted screenshot in chat
- **WHEN** a message contains a 1920×1080 screenshot
- **THEN** the conversation shows it as a 320×180 thumbnail with the message text around it

### Requirement: Enlarged image view
Opening a thumbnail SHALL show the image enlarged to fit the screen over a darkened page. It SHALL close with «×», Escape or a click outside the image, after which focus SHALL return to the thumbnail. When the formatted text has several images, «‹» and «›», the arrow keys and a swipe on touch screens SHALL move between them, with a «N из M» counter. «Скачать» SHALL save the original image.

#### Scenario: Browsing the screenshots of an instruction
- **WHEN** a user opens the second of three images in a message and presses ArrowRight
- **THEN** the third image is shown with «3 из 3», and Escape closes the view with focus back on its thumbnail

#### Scenario: On a phone
- **WHEN** a user taps a thumbnail on a phone and swipes left
- **THEN** the image fills the screen and the next image of the message is shown
