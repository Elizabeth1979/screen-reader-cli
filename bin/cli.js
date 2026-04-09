#!/usr/bin/env node
import { program } from "commander";

program
  .name("screenreader")
  .description("Screen reader CLI — browse any page as a screen reader would")
  .version("0.1.0");

program.parse();
