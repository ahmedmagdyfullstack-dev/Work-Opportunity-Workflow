import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { ClassificationService } from "./classification.service";
import { CvProfileService } from "./cv-profile.service";
import { ReplySuggestionService } from "./reply-suggestion.service";
import { RuleClassifierService } from "./rule-classifier.service";

@Module({
  imports: [DatabaseModule],
  providers: [
    ClassificationService,
    CvProfileService,
    ReplySuggestionService,
    RuleClassifierService
  ],
  exports: [
    ClassificationService,
    CvProfileService,
    ReplySuggestionService,
    RuleClassifierService
  ]
})
export class AiModule {}
